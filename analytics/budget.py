"""Write-budget guard for the analytics run (Task #80).

The collector's guard (Task #47, src/lib/collector/budget-guard.ts) stops
collection once 95% of Turso's monthly row-write cap is used, but analytics
kept writing past that line. This reads the same month-to-date JobRun totals
(`summary.writesTotal` + 1 per run for the JobRun row, as
src/lib/db/write-counts.ts sums them) and skips the run past the pause line.

Keep these in step with the TypeScript side:
  - ROWS_WRITTEN_PER_MONTH = TURSO_FREE_PLAN.rowsWrittenPerMonth (write-counts.ts)
  - PAUSE_AT               = BUDGET_GUARD.pauseAt               (budget-guard.ts)
"""
from __future__ import annotations

import json
from datetime import datetime

from db import Connection

ROWS_WRITTEN_PER_MONTH = 10_000_000
PAUSE_AT = 0.95


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


def pause_reason(writes_to_date: int, cap: int = ROWS_WRITTEN_PER_MONTH) -> str | None:
    """Pure: why this run should be skipped, or None to run it."""
    if writes_to_date < PAUSE_AT * cap:
        return None
    return (
        f"Write-budget guard: {writes_to_date:,} rows written this month "
        f"({writes_to_date / cap * 100:.1f}% of the {cap:,} cap) — "
        "analytics skipped until the month resets."
    )
