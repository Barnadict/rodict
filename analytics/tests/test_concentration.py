"""Tests for per-genre market concentration (Task #87).

Pins the daily averaging (a busy game's many readings count once per day),
the top-k shares and HHI, the minimum games per day and that days without
readings are absent rather than zero.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from concentration import MIN_GAMES, day_point, genre_series
from db import AnalyticsData

DAY0 = pd.Timestamp("2026-09-01T00:00:00Z")


def make_data(snaps: list[tuple[str, float, int]]) -> AnalyticsData:
    return AnalyticsData(
        games=pd.DataFrame({"id": [], "currentGenreId": []}),
        genres=pd.DataFrame({"id": ["sim"], "slug": ["simulator"], "name": ["Simulator"]}),
        game_snapshots=pd.DataFrame({
            "gameId": [g for g, _, _ in snaps],
            "collectedAt": [DAY0 + pd.Timedelta(days=d) for _, d, _ in snaps],
            "playing": [p for _, _, p in snaps],
        }),
        genre_snapshots=pd.DataFrame({"genreId": [], "collectedAt": [], "totalPlaying": []}),
    )


def test_day_point_shares_and_hhi():
    values = np.array([50.0, 20, 10, 10, 5, 5])
    p = day_point(values)
    assert p["n"] == 6
    assert p["total"] == 100
    assert p["top1"] == 0.5
    assert p["top5"] == 0.95
    assert p["top10"] == 1.0
    assert p["hhi"] == pytest.approx(0.25 + 0.04 + 0.01 + 0.01 + 0.0025 + 0.0025)


def test_day_point_needs_min_games_and_players():
    assert day_point(np.ones(MIN_GAMES - 1)) is None
    assert day_point(np.zeros(MIN_GAMES)) is None
    assert day_point(np.ones(MIN_GAMES)) is not None


def test_equal_games_have_hhi_one_over_n():
    p = day_point(np.full(8, 3.0))
    assert p["hhi"] == pytest.approx(1 / 8, abs=1e-4)
    assert p["top1"] == pytest.approx(1 / 8, abs=1e-4)


def test_busy_game_counts_once_per_day():
    # "big" is collected 4 times at 100; four quiet games once each at 100.
    snaps = [("big", 0.1 * i, 100) for i in range(1, 5)]
    snaps += [(f"q{i}", 0.5, 100) for i in range(4)]
    data = make_data(snaps)
    genre_of = {g: "sim" for g in ["big", "q0", "q1", "q2", "q3"]}
    series = genre_series(data.daily_game_averages(), genre_of)
    (point,) = series["sim"]
    assert point["day"] == "2026-09-01"
    assert point["top1"] == 0.2  # 100 of 500, not 400 of 800


def test_missing_days_are_absent_and_unclassified_ignored():
    snaps = [(f"g{i}", 0.5, 10 + i) for i in range(5)]
    snaps += [(f"g{i}", 3.5, 10) for i in range(5)]
    snaps += [("loose", 0.5, 1000)]
    data = make_data(snaps)
    genre_of = {f"g{i}": "sim" for i in range(5)}
    days = [p["day"] for p in genre_series(data.daily_game_averages(), genre_of)["sim"]]
    assert days == ["2026-09-01", "2026-09-04"]
