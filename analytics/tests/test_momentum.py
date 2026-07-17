"""Tests for trend & momentum metrics (Task #22, tested in #37).

These numbers drive the Rising boards, so a sign error or a bad denominator
would actively mislead a developer about which genres are climbing.
"""
from __future__ import annotations

import pandas as pd

from momentum import _slope_per_day, _window_growth


def snaps(points: list[tuple[str, int]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "collectedAt": pd.to_datetime([p[0] for p in points], utc=True),
            "playing": [p[1] for p in points],
        }
    )


NOW = pd.Timestamp("2026-01-31", tz="UTC")


class TestWindowGrowth:
    def test_computes_growth_from_first_to_last_point_in_window(self):
        df = snaps([("2026-01-28", 100), ("2026-01-30", 150)])
        assert _window_growth(df, NOW, 7) == 0.5  # +50%

    def test_reports_decline_as_negative(self):
        df = snaps([("2026-01-28", 200), ("2026-01-30", 100)])
        assert _window_growth(df, NOW, 7) == -0.5

    def test_flat_series_is_zero_growth(self):
        df = snaps([("2026-01-28", 100), ("2026-01-30", 100)])
        assert _window_growth(df, NOW, 7) == 0.0

    def test_ignores_points_outside_the_window(self):
        # The 7d window must not reach back to the 30-day-old point, or a
        # long-dead game would look like it's crashing this week.
        df = snaps([("2026-01-01", 1000), ("2026-01-28", 100), ("2026-01-30", 110)])
        assert _window_growth(df, NOW, 7) == 0.1  # 100 -> 110, not 1000 -> 110

    def test_wider_window_sees_the_older_baseline(self):
        df = snaps([("2026-01-01", 1000), ("2026-01-28", 100), ("2026-01-30", 110)])
        assert _window_growth(df, NOW, 30) == -0.89  # 1000 -> 110

    def test_returns_none_with_fewer_than_two_points_in_window(self):
        # One point is a value, not a trend.
        df = snaps([("2026-01-30", 100)])
        assert _window_growth(df, NOW, 7) is None
        assert _window_growth(snaps([]), NOW, 7) is None

    def test_returns_none_when_the_baseline_is_zero(self):
        # Growth from 0 is undefined (infinite), not a huge number.
        df = snaps([("2026-01-28", 0), ("2026-01-30", 100)])
        assert _window_growth(df, NOW, 7) is None

    def test_growth_is_scale_free(self):
        # A small game doubling and a huge game doubling both read +100%; that's
        # why momentum is anchored on the ratio rather than the raw slope.
        small = snaps([("2026-01-28", 10), ("2026-01-30", 20)])
        large = snaps([("2026-01-28", 100_000), ("2026-01-30", 200_000)])
        assert _window_growth(small, NOW, 7) == _window_growth(large, NOW, 7) == 1.0


class TestSlopePerDay:
    def test_computes_a_positive_slope_for_a_climbing_curve(self):
        # +100 players/day, exactly.
        df = snaps([("2026-01-01", 100), ("2026-01-02", 200), ("2026-01-03", 300)])
        assert _slope_per_day(df) == 100.0

    def test_computes_a_negative_slope_for_a_declining_curve(self):
        df = snaps([("2026-01-01", 300), ("2026-01-02", 200), ("2026-01-03", 100)])
        assert _slope_per_day(df) == -100.0

    def test_flat_curve_has_zero_slope(self):
        df = snaps([("2026-01-01", 100), ("2026-01-02", 100), ("2026-01-03", 100)])
        assert _slope_per_day(df) == 0.0

    def test_is_per_day_not_per_snapshot(self):
        # Two snapshots 12h apart, +50 players -> +100/day.
        df = snaps([("2026-01-01T00:00:00", 100), ("2026-01-01T12:00:00", 150)])
        assert _slope_per_day(df) == 100.0

    def test_returns_none_for_a_single_point(self):
        assert _slope_per_day(snaps([("2026-01-01", 100)])) is None

    def test_returns_none_for_a_zero_length_time_span(self):
        # All snapshots at the same instant — dividing by a zero span would be
        # an infinite slope.
        df = snaps([("2026-01-01T00:00:00", 100), ("2026-01-01T00:00:00", 200)])
        assert _slope_per_day(df) is None

    def test_fits_a_trend_through_noise(self):
        # Least-squares, not just first-to-last: the noisy endpoints must not
        # dominate the reported trend.
        df = snaps(
            [
                ("2026-01-01", 100),
                ("2026-01-02", 210),
                ("2026-01-03", 290),
                ("2026-01-04", 400),
            ]
        )
        assert 95 <= _slope_per_day(df) <= 105
