"""Write-budget guard for the analytics run (Task #80).

The collector's guard (Task #47, src/lib/collector/budget-guard.ts) stops
collection once 95% of Turso's monthly row-write cap is used, but analytics
kept writing past that line. This reads the same month-to-date JobRun totals
(`summary.writesTotal` + 1 per run for the JobRun row, as
src/lib/db/write-counts.ts sums them) and skips the run past the pause line.

Like the collector (Task #81), it also reads Turso's own rows-written counter
from the Platform API when TURSO_API_TOKEN + TURSO_ORG are set, and uses the
higher of the two. Turso's billing period starts at 04:00 UTC on the 1st, so a
period that doesn't start within a day of this month's start is ignored (see
applyTursoUsage in src/lib/db/write-counts.ts).

Keep these in step with the TypeScript side:
  - ROWS_WRITTEN_PER_MONTH = TURSO_FREE_PLAN.rowsWrittenPerMonth (write-counts.ts)
  - PAUSE_AT               = BUDGET_GUARD.pauseAt               (budget-guard.ts)
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timedelta

from db import Connection

ROWS_WRITTEN_PER_MONTH = 10_000_000
PAUSE_AT = 0.95
TURSO_API = "https://api.turso.tech/v1/organizations"


def month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def sum_measured_writes(summaries: list[str | None]) -> int:
    """Pure: measured rows written by these runs (JobRun rows included).

    Runs without a numeric `writesTotal` (unparseable, or from before #42)
    count as unmeasured, i.e. 0 — the same rule as the TypeScript report.
    """
    total = 0
    for raw in summaries:
        try:
            summary = json.loads(raw) if raw else None
        except ValueError:
            continue
        writes = summary.get("writesTotal") if isinstance(summary, dict) else None
        if isinstance(writes, (int, float)) and not isinstance(writes, bool):
            total += int(writes) + 1
    return total


def month_writes_to_date(con: Connection, now: datetime) -> int:
    """This month's measured writes, from JobRun. Read-only (a few hundred rows)."""
    # startedAt is an ISO-8601 string, so the month bounds compare as text.
    cur = con.cursor()
    cur.execute(
        'SELECT summary FROM "JobRun" WHERE startedAt >= ? AND startedAt <= ?',
        (month_start(now).isoformat(timespec="milliseconds"), now.isoformat(timespec="milliseconds")),
    )
    rows = cur.fetchall()
    return sum_measured_writes([r[0] for r in rows])


def turso_rows_written(
    usage: dict, subscription: dict, now: datetime
) -> int | None:
    """Pure: Turso's count for this month, or None if malformed or out of step."""
    try:
        rows = usage["organization"]["usage"]["rows_written"]
        start = datetime.fromisoformat(subscription["subscription"]["current_billing_period_start"])
    except (KeyError, TypeError, ValueError):
        return None
    if not isinstance(rows, int) or isinstance(rows, bool):
        return None
    if abs(start - month_start(now)) >= timedelta(days=1):
        return None
    return rows


def fetch_turso_rows_written(now: datetime) -> int | None:
    """Turso's counter via the Platform API; None when not configured or on any error."""
    token, org = os.environ.get("TURSO_API_TOKEN"), os.environ.get("TURSO_ORG")
    if not token or not org:
        return None

    def get(path: str) -> dict:
        req = urllib.request.Request(
            f"{TURSO_API}/{org}/{path}", headers={"Authorization": f"Bearer {token}"}
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.load(res)

    try:
        return turso_rows_written(get("usage"), get("subscription"), now)
    except Exception as exc:  # fall back to the measured count
        print(f"  Turso usage unavailable, using the measured count: {exc}")
        return None


def pause_reason(writes_to_date: int, cap: int = ROWS_WRITTEN_PER_MONTH) -> str | None:
    """Pure: why this run should be skipped, or None to run it."""
    if writes_to_date < PAUSE_AT * cap:
        return None
    return (
        f"Write-budget guard: {writes_to_date:,} rows written this month "
        f"({writes_to_date / cap * 100:.1f}% of the {cap:,} cap) — "
        "analytics skipped until the month resets."
    )
