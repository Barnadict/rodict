"""Run all Phase 4 analytics jobs in order and report a summary.

Usage (from repo root):  analytics/.venv/Scripts/python analytics/run.py
Order matters only loosely; each job reads the DB fresh and replaces its own
AnalyticsResult rows. CI scheduling is Task #33 (.github/workflows/analytics.yml).

One job failing never blocks the others (each is independent), but if ANY job
fails the process exits non-zero so CI reports the run as failed — a workflow
that always goes green would be worthless as a monitoring signal (Task #34).
"""
from __future__ import annotations

import sys
import time
import traceback
from datetime import datetime, timezone

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
]


def main() -> tuple[list[str], dict[str, int]]:
    """Run every job; return the names of those that failed + per-job result counts."""
    failed: list[str] = []
    written: dict[str, int] = {}
    for name, fn in JOBS:
        start = time.time()
        try:
            n = fn()
            written[name] = n
            print(f"  {name:20s} wrote {n:3d} results  ({time.time() - start:.1f}s)")
        except Exception as exc:  # keep going; one job failing shouldn't block others
            print(f"  {name:20s} FAILED: {exc}")
            traceback.print_exc()
            failed.append(name)
    return failed, written


if __name__ == "__main__":
    print("Running Phase 4 analytics jobs...")
    started_at = datetime.now(timezone.utc)
    failures, written = main()
    finished_at = datetime.now(timezone.utc)

    # Log the run for monitoring (Task #34). Some jobs succeeding while others
    # fail is "partial" — the results that did land are still valid to serve.
    if failures:
        status = "failure" if len(failures) == len(JOBS) else "partial"
    else:
        status = "success"
    try:
        con = db.connect()
        db.record_job_run(
            con,
            job="analytics",
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            summary={"jobs": len(JOBS), "failed": len(failures), "written": written},
            error=("failed jobs: " + ", ".join(failures)) if failures else None,
        )
        con.close()
    except Exception as exc:  # never let bookkeeping mask the jobs' own outcome
        print(f"WARNING: could not record job run: {exc}")

    if failures:
        print(f"\nFAILED: {len(failures)} of {len(JOBS)} job(s) — {', '.join(failures)}")
        sys.exit(1)
    print("Done.")
