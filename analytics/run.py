"""Run all Phase 4 analytics jobs in order and report a summary.

Usage (from repo root):  analytics/.venv/Scripts/python analytics/run.py
CI scheduling is Task #33 (.github/workflows/analytics.yml).

The data every job reads is loaded ONCE up front and shared (Task #44) — each
job used to re-read the whole snapshot history itself, which is what pushed
most runs past the CI timeout. Each job then syncs only its own
AnalyticsResult rows, writing just what changed (Task #43).

One job failing never blocks the others (each is independent), but if ANY job
fails the process exits non-zero so CI reports the run as failed — a workflow
that always goes green would be worthless as a monitoring signal (Task #34).

Before loading anything, the write-budget guard (Task #80, budget.py) checks
this month's measured writes. Past the collector's 95% pause line the run is
skipped and logged `partial` (no alert). `--ignore-budget` runs it anyway.
"""
from __future__ import annotations

import sys
import time
import traceback
from datetime import datetime, timezone

import budget
import db
import survival
import momentum
import clustering
import opportunity
import anomaly
import correlation
import cohort
import seasonality
import forecast
import update_impact

JOBS = [
    ("survival_km", survival.run),
    ("trend_momentum", momentum.run),
    ("trajectory_cluster", clustering.run),
    ("opportunity_score", opportunity.run),
    ("change_point", anomaly.run),
    ("correlation", correlation.run),
    ("cohort", cohort.run),
    ("seasonality", seasonality.run),
    ("forecast", forecast.run),
    ("update_impact", update_impact.run),
]


def main(con: db.Connection, data: db.AnalyticsData) -> tuple[list[str], dict[str, dict]]:
    """Run every job; return the names of those that failed + per-job write stats."""
    failed: list[str] = []
    written: dict[str, dict] = {}
    for name, fn in JOBS:
        start = time.time()
        try:
            stats = fn(con, data)
            written[name] = stats
            print(
                f"  {name:20s} +{stats['inserted']} ~{stats['updated']} -{stats['deleted']}"
                f" ={stats['unchanged']}  ({time.time() - start:.1f}s)"
            )
        except Exception as exc:  # keep going; one job failing shouldn't block others
            print(f"  {name:20s} FAILED: {exc}")
            traceback.print_exc()
            try:
                con.rollback()  # don't let a half-done job's writes ride on the next commit
            except Exception:
                pass
            failed.append(name)
    return failed, written


def _analytics_writes(written: dict[str, dict]) -> dict[str, dict]:
    """Per-table row writes (Task #42 accounting; the JobRun row itself excluded)."""
    total = {"inserted": 0, "updated": 0, "deleted": 0}
    for stats in written.values():
        for k in total:
            total[k] += stats[k]
    return {"AnalyticsResult": total}


def skip_for_budget(con: db.Connection, started_at: datetime) -> bool:
    """Record a skipped run and return True when the write budget is past the pause line."""
    measured = budget.month_writes_to_date(con, started_at)
    turso = budget.fetch_turso_rows_written(started_at) if db.is_remote() else None
    reason = budget.pause_reason(max(measured, turso or 0))
    if reason is None:
        return False
    print(f"::warning::{reason}")
    db.record_job_run(
        con,
        job="analytics",
        status="partial",
        started_at=started_at,
        finished_at=datetime.now(timezone.utc),
        summary={"jobs": 0, "failed": 0, "budgetGuard": "paused", "writes": {}, "writesTotal": 0},
        error=reason,
    )
    return True


if __name__ == "__main__":
    print("Running Phase 4 analytics jobs...")
    started_at = datetime.now(timezone.utc)
    con = db.connect()

    if "--ignore-budget" not in sys.argv:
        try:
            skipped = skip_for_budget(con, started_at)
        except Exception:
            con.close()
            raise
        if skipped:
            con.close()
            sys.exit(0)

    load_start = time.time()
    failures: list[str]
    written: dict[str, dict] = {}
    rows_loaded: dict[str, int] = {}
    load_error: str | None = None
    try:
        data = db.load_all(con)
        rows_loaded = data.row_counts()
        print(f"  loaded {rows_loaded}  ({time.time() - load_start:.1f}s)")
        failures, written = main(con, data)
    except Exception as exc:  # nothing can run without the data
        traceback.print_exc()
        load_error = f"loading data failed: {exc}"
        failures = [name for name, _ in JOBS]
    finished_at = datetime.now(timezone.utc)

    # Log the run for monitoring (Task #34). Some jobs succeeding while others
    # fail is "partial" — the results that did land are still valid to serve.
    if failures:
        status = "failure" if len(failures) == len(JOBS) else "partial"
    else:
        status = "success"
    writes = _analytics_writes(written)
    try:
        db.record_job_run(
            con,
            job="analytics",
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            summary={
                "jobs": len(JOBS),
                "failed": len(failures),
                "written": written,
                "rowsLoaded": rows_loaded,
                "writes": writes,
                "writesTotal": sum(sum(t.values()) for t in writes.values()),
            },
            error=load_error or (("failed jobs: " + ", ".join(failures)) if failures else None),
        )
    except Exception as exc:  # never let bookkeeping mask the jobs' own outcome
        print(f"WARNING: could not record job run: {exc}")
    finally:
        con.close()

    if failures:
        print(f"\nFAILED: {len(failures)} of {len(JOBS)} job(s) — {', '.join(failures)}")
        sys.exit(1)
    print("Done.")
