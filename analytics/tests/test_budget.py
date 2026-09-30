"""Tests for the analytics write-budget guard (Task #80)."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone

import pytest

import budget


def test_sums_measured_runs_plus_their_jobrun_rows():
    summaries = [
        json.dumps({"writesTotal": 100}),
        json.dumps({"writesTotal": 0}),
        json.dumps({"jobs": 10}),  # unmeasured (before #42)
        "not json",
        None,
        json.dumps({"writesTotal": True}),  # not a count
    ]
    assert budget.sum_measured_writes(summaries) == 102


def test_pauses_at_95_percent_like_the_collector():
    assert budget.pause_reason(9_499_999) is None
    reason = budget.pause_reason(9_500_000)
    assert reason is not None
    assert "9,500,000 rows written this month (95.0% of the 10,000,000 cap)" in reason


@pytest.fixture
def con():
    c = sqlite3.connect(":memory:")
    c.execute('CREATE TABLE "JobRun" (id TEXT, job TEXT, startedAt TEXT, summary TEXT)')
    yield c
    c.close()


def test_reads_only_this_months_runs(con):
    rows = [
        ("a", "collect", "2026-09-30T23:59:59.999+00:00", json.dumps({"writesTotal": 5000})),
        ("b", "collect", "2026-10-01T00:00:00.000+00:00", json.dumps({"writesTotal": 10})),
        ("c", "analytics", "2026-10-02T12:00:00.000+00:00", json.dumps({"writesTotal": 20})),
        ("d", "collect", "2026-10-03T00:00:00.000+00:00", json.dumps({"writesTotal": 999})),
    ]
    con.executemany('INSERT INTO "JobRun" VALUES (?, ?, ?, ?)', rows)
    now = datetime(2026, 10, 2, 18, tzinfo=timezone.utc)
    assert budget.month_writes_to_date(con, now) == 11 + 21


def _usage(rows):
    return {"organization": {"usage": {"rows_written": rows}}}


def _sub(start):
    return {"subscription": {"current_billing_period_start": start}}


def test_turso_count_only_when_its_period_matches_the_month():
    now = datetime(2026, 10, 10, tzinfo=timezone.utc)
    assert budget.turso_rows_written(_usage(5000), _sub("2026-10-01T04:00:00+00:00"), now) == 5000
    # First hours of a month: Turso still shows last month's period.
    assert budget.turso_rows_written(_usage(9_000_000), _sub("2026-09-01T04:00:00+00:00"), now) is None
    assert budget.turso_rows_written({}, _sub("2026-10-01T04:00:00+00:00"), now) is None
    assert budget.turso_rows_written(_usage(5000), _sub("garbage"), now) is None
