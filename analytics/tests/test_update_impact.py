"""Tests for per-genre update impact (Task #63).

The windows and rules mirror src/lib/update-impact.ts, so these pin the same
edge cases: the reading at the update instant, pending windows, overlapping
updates, and the baseline that keeps tiny games' +100% swings out of a genre's
summary.
"""
from __future__ import annotations

import pandas as pd

from db import AnalyticsData
from update_impact import MIN_BASELINE, MIN_UPDATES, genre_changes, measure, summarize

T = pd.Timestamp("2026-07-20T12:00:00Z")


def h(hours: float) -> pd.Timestamp:
    return T + pd.Timedelta(hours=hours)


def snaps(points: list[tuple[float, int]], game_id: str = "g1") -> pd.DataFrame:
    return pd.DataFrame({
        "gameId": [game_id] * len(points),
        "collectedAt": [h(x) for x, _ in points],
        "playing": [p for _, p in points],
    })


LATER = h(24 * 30)


def test_measure_averages_each_side():
    s = snaps([(-30, 999), (-20, 100), (-5, 200), (0, 5000), (3, 300), (20, 300)])
    m = measure(T, 24, s, [T], LATER)
    assert m["status"] == "ok"
    assert m["before"] == 150 and m["after"] == 300
    assert m["changePct"] == 1.0
    assert not m["overlapped"]


def test_measure_pending_until_the_window_elapses():
    m = measure(T, 72, snaps([(-1, 100), (1, 100)]), [T], h(48))
    assert m["status"] == "pending" and m["changePct"] is None


def test_measure_no_data_on_an_empty_side():
    m = measure(T, 24, snaps([(1, 100)]), [T], LATER)
    assert m["status"] == "no_data" and m["changePct"] is None


def test_measure_flags_overlap_only_inside_the_window():
    s = snaps([(-1, 100), (1, 100)])
    assert not measure(T, 24, s, [T, h(30)], LATER)["overlapped"]
    assert measure(T, 72, s, [T, h(30)], LATER)["overlapped"]


def test_summarize_needs_enough_updates():
    assert summarize([0.1] * (MIN_UPDATES - 1), 24)["status"] == "insufficient"
    out = summarize([-0.2, 0.0, 0.1, 0.3, 0.5], 24)
    assert out["status"] == "ok"
    assert out["n"] == 5
    assert out["medianChangePct"] == 0.1
    assert out["shareUp"] == 0.6


def _data(games: list[dict], snapshots: pd.DataFrame, updates: list[tuple[str, pd.Timestamp]]):
    return AnalyticsData(
        games=pd.DataFrame(games),
        genres=pd.DataFrame({"id": ["genre"], "slug": ["x"], "name": ["X"]}),
        game_snapshots=snapshots.sort_values("collectedAt").reset_index(drop=True),
        genre_snapshots=pd.DataFrame({"genreId": [], "collectedAt": [], "totalPlaying": []}),
        game_updates=pd.DataFrame({
            "gameId": [g for g, _ in updates],
            "updatedAt": [t for _, t in updates],
        }),
    )


def test_genre_changes_applies_the_baseline_and_skips_unclassified_games():
    big = snaps([(-1, 200), (1, 300), (24 * 30, 1)], "big")
    tiny = snaps([(-1, MIN_BASELINE - 1), (1, 100)], "tiny")
    loose = snaps([(-1, 200), (1, 100)], "loose")
    data = _data(
        [
            {"id": "big", "currentGenreId": "genre"},
            {"id": "tiny", "currentGenreId": "genre"},
            {"id": "loose", "currentGenreId": None},
        ],
        pd.concat([big, tiny, loose]),
        [("big", T), ("tiny", T), ("loose", T)],
    )
    out = genre_changes(data)
    assert out == {"genre": {24: [0.5], 72: [0.5]}}
