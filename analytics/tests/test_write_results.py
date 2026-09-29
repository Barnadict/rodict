"""Tests for the diff-based result writer (Task #43).

Every row written counts against Turso's monthly write cap, so the writer must
leave unchanged results alone while still converging the stored set to exactly
the latest run's results.
"""
from __future__ import annotations

import sqlite3

import pytest

from db import write_results


@pytest.fixture
def con():
    c = sqlite3.connect(":memory:")
    c.execute(
        """CREATE TABLE "AnalyticsResult" (
             id TEXT PRIMARY KEY, kind TEXT, scopeType TEXT, scopeId TEXT,
             periodStart TEXT, periodEnd TEXT, computedAt TEXT, version TEXT, payload TEXT)"""
    )
    yield c
    c.close()


def row(scope_id, payload, scope_type="genre"):
    return {"scopeType": scope_type, "scopeId": scope_id, "payload": payload}


def stored(con, kind="k"):
    return dict(
        con.execute(
            'SELECT scopeId, payload FROM "AnalyticsResult" WHERE kind = ? ORDER BY scopeId', (kind,)
        ).fetchall()
    )


def test_first_run_inserts_everything(con):
    stats = write_results(con, "k", [row("a", {"x": 1}), row("b", {"x": 2})])
    assert stats == {"inserted": 2, "updated": 0, "deleted": 0, "unchanged": 0}
    assert stored(con) == {"a": '{"x":1}', "b": '{"x":2}'}


def test_identical_rerun_writes_nothing(con):
    rows = [row("a", {"x": 1}), row("b", {"x": 2}), row(None, {"g": 1}, "global")]
    write_results(con, "k", rows)
    stats = write_results(con, "k", rows)
    assert stats == {"inserted": 0, "updated": 0, "deleted": 0, "unchanged": 3}


def test_changed_payload_is_updated_in_place(con):
    write_results(con, "k", [row("a", {"x": 1})])
    (old_id,) = con.execute('SELECT id FROM "AnalyticsResult"').fetchone()
    stats = write_results(con, "k", [row("a", {"x": 2})])
    assert stats["updated"] == 1 and stats["inserted"] == 0
    assert con.execute('SELECT id, payload FROM "AnalyticsResult"').fetchall() == [(old_id, '{"x":2}')]


def test_scopes_that_disappear_are_deleted(con):
    write_results(con, "k", [row("a", {"x": 1}), row("b", {"x": 2})])
    stats = write_results(con, "k", [row("a", {"x": 1})])
    assert stats == {"inserted": 0, "updated": 0, "deleted": 1, "unchanged": 1}
    assert stored(con) == {"a": '{"x":1}'}


def test_global_scope_with_null_id_is_matched(con):
    write_results(con, "k", [row(None, {"g": 1}, "global")])
    assert write_results(con, "k", [row(None, {"g": 1}, "global")])["unchanged"] == 1


def test_other_kinds_are_untouched(con):
    write_results(con, "other", [row("a", {"x": 1})])
    write_results(con, "k", [])
    assert stored(con, "other") == {"a": '{"x":1}'}


def test_old_duplicates_are_cleaned_up_keeping_the_newest(con):
    con.executemany(
        'INSERT INTO "AnalyticsResult" VALUES (?, "k", "genre", "a", NULL, NULL, ?, "1", ?)',
        [("old", "2026-01-01T00:00:00.000+00:00", '{"x":0}'), ("new", "2026-01-02T00:00:00.000+00:00", '{"x":1}')],
    )
    stats = write_results(con, "k", [row("a", {"x": 1})])
    assert stats == {"inserted": 0, "updated": 0, "deleted": 1, "unchanged": 1}
    assert con.execute('SELECT id FROM "AnalyticsResult"').fetchall() == [("new",)]


def test_duplicate_scopes_in_one_run_are_rejected(con):
    with pytest.raises(ValueError):
        write_results(con, "k", [row("a", {"x": 1}), row("a", {"x": 2})])


def test_batches_larger_than_one_statement_round_trip_correctly(con):
    # More rows than DELETE_CHUNK / UPSERT_CHUNK, so every path spans several
    # multi-row statements (the writer never uses per-row executemany).
    n = 1234
    write_results(con, "k", [row(str(i), {"x": i}) for i in range(n)])
    # change every 3rd, drop the last 600, keep the rest
    rows = [row(str(i), {"x": i + (1 if i % 3 == 0 else 0)}) for i in range(n - 600)]
    stats = write_results(con, "k", rows)
    changed = len([i for i in range(n - 600) if i % 3 == 0])
    assert stats == {"inserted": 0, "updated": changed, "deleted": 600, "unchanged": n - 600 - changed}
    assert stored(con) == {str(i): f'{{"x":{i + (1 if i % 3 == 0 else 0)}}}' for i in range(n - 600)}
