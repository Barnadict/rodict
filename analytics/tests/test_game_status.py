"""Tests for the current-death rule and the Game.status sync (Task #85).

`current_death` differs from `detect_death` on one point: a game that died and
then recovered is alive again, because Game.status describes the game now.
"""
from __future__ import annotations

import pandas as pd

from db import AnalyticsData
from deadrule import DEAD_DAYS, current_death, detect_death
from game_status import changed_rows

START = pd.Timestamp("2026-09-01T00:00:00Z")


def daily(values: list[int], game_id: str = "g") -> pd.DataFrame:
    return pd.DataFrame({
        "gameId": [game_id] * len(values),
        "collectedAt": [START + pd.Timedelta(days=i) for i in range(len(values))],
        "playing": values,
    })


def test_dead_now_returns_the_start_of_the_final_run():
    s = daily([100] * 3 + [1] * (DEAD_DAYS + 1))
    assert current_death(s, 100) == START + pd.Timedelta(days=3)


def test_run_too_short_is_not_dead():
    assert current_death(daily([100] * 3 + [1] * (DEAD_DAYS - 1)), 100) is None


def test_recovered_game_is_alive_though_it_once_died():
    s = daily([100] + [1] * (DEAD_DAYS + 2) + [50])
    assert detect_death(s, 100) is not None
    assert current_death(s, 100) is None


def test_a_long_gap_breaks_the_run():
    s = daily([100] + [1] * 3)
    later = daily([1] * 5)
    later["collectedAt"] = later["collectedAt"] + pd.Timedelta(days=30)
    assert current_death(pd.concat([s, later], ignore_index=True), 100) is None


def make_data(games: list[dict], snaps: pd.DataFrame) -> AnalyticsData:
    return AnalyticsData(
        games=pd.DataFrame(games),
        genres=pd.DataFrame({"id": [], "slug": [], "name": []}),
        game_snapshots=snaps,
        genre_snapshots=pd.DataFrame({"genreId": [], "collectedAt": [], "totalPlaying": []}),
    )


def test_changed_rows_only_lists_differences():
    died = START + pd.Timedelta(days=1)
    snaps = pd.concat([
        daily([100] + [1] * (DEAD_DAYS + 1), "newly_dead"),
        daily([100] + [1] * (DEAD_DAYS + 1), "still_dead"),
        daily([100] * 3, "revived"),
        daily([100] * 3, "alive"),
    ], ignore_index=True)
    games = [
        {"id": "newly_dead", "allTimePeakPlayers": 100, "status": "active", "deadSince": pd.NaT},
        {"id": "still_dead", "allTimePeakPlayers": 100, "status": "dead", "deadSince": died},
        {"id": "revived", "allTimePeakPlayers": 100, "status": "dead", "deadSince": died},
        {"id": "alive", "allTimePeakPlayers": 100, "status": "active", "deadSince": pd.NaT},
    ]
    rows = changed_rows(make_data(games, snaps))
    assert sorted(rows) == [
        ("newly_dead", "dead", "2026-09-02T00:00:00.000+00:00"),
        ("revived", "active", None),
    ]


def test_run_updates_only_changed_games_in_sqlite():
    import sqlite3

    from game_status import run

    con = sqlite3.connect(":memory:")
    con.execute('CREATE TABLE "Game" (id TEXT PRIMARY KEY, status TEXT, deadSince TEXT)')
    con.executemany(
        'INSERT INTO "Game" VALUES (?, ?, ?)',
        [("a", "active", None), ("b", "dead", "2026-09-02T00:00:00.000+00:00"), ("c", "active", None)],
    )
    snaps = pd.concat([
        daily([100] + [1] * (DEAD_DAYS + 1), "a"),
        daily([100] * 3, "b"),
        daily([100] * 3, "c"),
    ], ignore_index=True)
    games = [
        {"id": "a", "allTimePeakPlayers": 100, "status": "active", "deadSince": pd.NaT},
        {"id": "b", "allTimePeakPlayers": 100, "status": "dead",
         "deadSince": pd.Timestamp("2026-09-02T00:00:00Z")},
        {"id": "c", "allTimePeakPlayers": 100, "status": "active", "deadSince": pd.NaT},
    ]
    stats = run(con, make_data(games, snaps))
    assert stats == {"table": "Game", "inserted": 0, "updated": 2, "deleted": 0, "unchanged": 1}
    assert con.execute('SELECT id, status, deadSince FROM "Game" ORDER BY id').fetchall() == [
        ("a", "dead", "2026-09-02T00:00:00.000+00:00"),
        ("b", "active", None),
        ("c", "active", None),
    ]
