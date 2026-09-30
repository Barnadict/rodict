"""Tests for the daily rank ladders (Task #90).

Pins the rounding (must match JS Math.round, or the game page ranks a game
below itself), the per-genre sorted ladders, the MIN_PLAYERS cut, the `until`
timestamp and the KEEP_DAYS window.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import AnalyticsData
from rank_ladder import KEEP_DAYS, UNCLASSIFIED, ladders, round_players

DAY0 = pd.Timestamp("2026-09-01T00:00:00Z")


def make_data(games: dict[str, str | None], snaps: list[tuple[str, float, int]]) -> AnalyticsData:
    return AnalyticsData(
        games=pd.DataFrame({"id": list(games), "currentGenreId": list(games.values())}),
        genres=pd.DataFrame({"id": ["sim"], "slug": ["simulator"], "name": ["Simulator"]}),
        game_snapshots=pd.DataFrame({
            "gameId": [g for g, _, _ in snaps],
            "collectedAt": [DAY0 + pd.Timedelta(hours=h) for _, h, _ in snaps],
            "playing": [p for _, _, p in snaps],
        }).sort_values("collectedAt").reset_index(drop=True),
        genre_snapshots=pd.DataFrame({"genreId": [], "collectedAt": [], "totalPlaying": []}),
    )


def test_round_half_up_like_js():
    assert round_players(np.array([0.5, 1.5, 2.5, 2.49, 10.0])).tolist() == [1, 2, 3, 2, 10]


def test_ladder_per_genre_sorted_desc_with_counts():
    games = {"a": "sim", "b": "sim", "c": "obby", "d": None, "e": "sim"}
    snaps = [
        ("a", 1, 10), ("a", 4, 21),  # avg 15.5 -> 16
        ("b", 2, 40),
        ("c", 2, 7),
        ("d", 2, 3),
        ("e", 2, 0),  # below MIN_PLAYERS: counted, not laddered
    ]
    (day,) = ladders(make_data(games, snaps))
    assert day["day"] == DAY0
    assert day["until"] == DAY0 + pd.Timedelta(hours=4)
    assert day["n"] == {"_": 1, "obby": 1, "sim": 3}
    assert day["v"] == {"_": [3], "obby": [7], "sim": [40, 16]}
    assert UNCLASSIFIED == "_"


def test_keeps_only_last_days():
    games = {"a": "sim"}
    snaps = [("a", 24 * d + 1, 5) for d in range(KEEP_DAYS + 5)]
    days = ladders(make_data(games, snaps))
    assert len(days) == KEEP_DAYS
    assert days[-1]["day"] == DAY0 + pd.Timedelta(days=KEEP_DAYS + 4)
