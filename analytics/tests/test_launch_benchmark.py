"""Tests for per-genre launch benchmarks (Task #83).

Pins the survivorship-bias rule (only games first seen near launch count), the
per-day averaging, the minimum games per day and the stored percentiles.
"""
from __future__ import annotations

import pandas as pd

from db import AnalyticsData
from launch_benchmark import MAX_DAY, MIN_GAMES, NEAR_LAUNCH_DAYS, QUANTILES, daily_by_age, summarize

LAUNCH = pd.Timestamp("2026-07-01T00:00:00Z")


def at(days: float) -> pd.Timestamp:
    return LAUNCH + pd.Timedelta(days=days)


def make_data(games: list[dict], snaps: list[tuple[str, float, int]]) -> AnalyticsData:
    return AnalyticsData(
        games=pd.DataFrame(games),
        genres=pd.DataFrame({"id": ["sim"], "slug": ["simulator"], "name": ["Simulator"]}),
        game_snapshots=pd.DataFrame({
            "gameId": [g for g, _, _ in snaps],
            "collectedAt": [at(d) for _, d, _ in snaps],
            "playing": [p for _, _, p in snaps],
        }),
        genre_snapshots=pd.DataFrame({"genreId": [], "collectedAt": [], "totalPlaying": []}),
    )


def game(gid: str, created: pd.Timestamp = LAUNCH, genre: str | None = "sim") -> dict:
    return {"id": gid, "currentGenreId": genre, "robloxCreatedAt": created}


def test_daily_average_per_game_and_day():
    data = make_data([game("a")], [("a", 0.1, 10), ("a", 0.5, 30), ("a", 1.2, 50)])
    daily = daily_by_age(data).sort_values("day")
    assert daily["day"].tolist() == [0, 1]
    assert daily["avg"].tolist() == [20.0, 50.0]


def test_games_found_late_are_left_out():
    late = NEAR_LAUNCH_DAYS + 1
    data = make_data(
        [game("early"), game("late"), game("nodate", created=pd.NaT), game("nogenre", genre=None)],
        [("early", 2, 10), ("late", late, 999), ("nodate", 1, 5), ("nogenre", 1, 5)],
    )
    assert set(daily_by_age(data)["gameId"]) == {"early"}


def test_readings_outside_the_age_window_are_dropped():
    data = make_data([game("a")], [("a", 1, 10), ("a", MAX_DAY + 1.5, 10)])
    assert daily_by_age(data)["day"].tolist() == [1]


def test_summarize_needs_min_games_per_day():
    rows = [{"gameId": f"g{i}", "genreId": "sim", "day": 3, "avg": float(i)} for i in range(MIN_GAMES)]
    rows.append({"gameId": "g0", "genreId": "sim", "day": 4, "avg": 1.0})
    out = summarize(pd.DataFrame(rows))
    assert out["status"] == "ok"
    assert out["nGames"] == MIN_GAMES
    assert [d["day"] for d in out["days"]] == [3]
    q = out["days"][0]["q"]
    assert len(q) == len(QUANTILES)
    # 0..4 evenly spaced: the median is 2 and p25/p75 are 1 and 3.
    assert (q[4], q[9], q[14]) == (1.0, 2.0, 3.0)


def test_summarize_insufficient_without_enough_games():
    out = summarize(pd.DataFrame({"gameId": ["a"], "genreId": ["sim"], "day": [0], "avg": [5.0]}))
    assert out["status"] == "insufficient" and out["days"] == []
