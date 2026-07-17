"""Tests for the opportunity score (Task #24, tested in #37).

This is the most decision-relevant number on the site — it ranks which genres
look under-served. It's explicitly a descriptive signal rather than advice, but
that's all the more reason the arithmetic behind it must be exactly what the
documented weights say.
"""
from __future__ import annotations

import pandas as pd
import pytest

from opportunity import WEIGHTS, _genre_growth7d, _minmax


class TestMinmax:
    def test_normalizes_to_the_zero_one_range(self):
        out = _minmax(pd.Series([10.0, 20.0, 30.0]))
        assert list(out) == [0.0, 0.5, 1.0]

    def test_constant_series_maps_to_the_midpoint(self):
        # Not 0 and not a divide-by-zero: when every genre scores the same on a
        # component, that component must not tilt the ranking either way.
        out = _minmax(pd.Series([5.0, 5.0, 5.0]))
        assert list(out) == [0.5, 0.5, 0.5]

    def test_single_value_maps_to_the_midpoint(self):
        # With one classified genre there's nothing to compare against.
        assert list(_minmax(pd.Series([42.0]))) == [0.5]

    def test_handles_negative_values(self):
        # Genre growth can be negative; min-max must place it, not clip it.
        out = _minmax(pd.Series([-1.0, 0.0, 1.0]))
        assert list(out) == [0.0, 0.5, 1.0]

    def test_preserves_order(self):
        s = pd.Series([3.0, 1.0, 2.0])
        out = _minmax(s)
        assert out[1] < out[2] < out[0]


class TestWeights:
    def test_supply_is_the_only_penalized_component(self):
        # Crowding is the one thing that should push a score DOWN; if any other
        # weight went negative the ranking would silently invert.
        assert WEIGHTS["supply"] < 0
        for key in ("intensity", "demand", "growth"):
            assert WEIGHTS[key] > 0

    def test_demand_side_outweighs_the_crowding_penalty(self):
        # Otherwise an empty genre with no players would top the ranking purely
        # for being empty.
        assert WEIGHTS["intensity"] + WEIGHTS["demand"] + WEIGHTS["growth"] > abs(
            WEIGHTS["supply"]
        )

    def test_intensity_is_the_dominant_signal(self):
        # Players-per-game is the core "under-served" signal the score exists to
        # express — it must carry the most weight.
        assert WEIGHTS["intensity"] == max(WEIGHTS.values(), key=abs)


def gsnaps(rows: list[tuple[str, str, int]]) -> pd.DataFrame:
    """[(genreId, iso_time, totalPlaying), ...] -> the loader's frame shape."""
    return pd.DataFrame(
        {
            "genreId": [r[0] for r in rows],
            "collectedAt": pd.to_datetime([r[1] for r in rows], utc=True),
            "totalPlaying": [r[2] for r in rows],
        }
    )


class TestGenreGrowth7d:
    def test_computes_growth_per_genre_within_the_window(self):
        out = _genre_growth7d(
            gsnaps([("a", "2026-01-28", 100), ("a", "2026-01-30", 150)])
        )
        assert out["a"] == pytest.approx(0.5)

    def test_windows_relative_to_the_newest_snapshot_not_wall_clock(self):
        # The job may run well after collection; anchoring on "now" would make
        # every genre fall out of its own window and silently zero the growth
        # component for everyone.
        out = _genre_growth7d(
            gsnaps([("a", "2020-01-01", 100), ("a", "2020-01-03", 200)])
        )
        assert out["a"] == pytest.approx(1.0)

    def test_excludes_points_older_than_the_window(self):
        out = _genre_growth7d(
            gsnaps(
                [
                    ("a", "2026-01-01", 1000),  # >7d before the latest point
                    ("a", "2026-01-28", 100),
                    ("a", "2026-01-30", 110),
                ]
            )
        )
        assert out["a"] == pytest.approx(0.1)

    def test_skips_a_genre_with_a_single_point(self):
        assert _genre_growth7d(gsnaps([("a", "2026-01-30", 100)])) == {}

    def test_skips_a_genre_whose_baseline_is_zero(self):
        out = _genre_growth7d(gsnaps([("a", "2026-01-28", 0), ("a", "2026-01-30", 50)]))
        assert "a" not in out

    def test_handles_an_empty_frame(self):
        assert _genre_growth7d(gsnaps([])) == {}

    def test_keeps_genres_independent(self):
        out = _genre_growth7d(
            gsnaps(
                [
                    ("a", "2026-01-28", 100),
                    ("a", "2026-01-30", 200),
                    ("b", "2026-01-28", 100),
                    ("b", "2026-01-30", 50),
                ]
            )
        )
        assert out["a"] == pytest.approx(1.0)
        assert out["b"] == pytest.approx(-0.5)
