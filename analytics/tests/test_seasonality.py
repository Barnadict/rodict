"""Tests for seasonality detection (Task #28, tested in #37).

The headline risk here is claiming a weekly pattern that doesn't exist — with a
day of data you can always "find" one. The MIN_DISTINCT_DAYS guard is what makes
the card say "not enough history" instead of inventing a signal.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from seasonality import MIN_DISTINCT_DAYS, _analyze


def series(start: str, periods: int, freq: str, values) -> pd.DataFrame:
    idx = pd.date_range(start, periods=periods, freq=freq, tz="UTC")
    return pd.DataFrame({"collectedAt": idx, "totalPlaying": values})


def test_reports_insufficient_below_the_day_threshold():
    # A few hours of history cannot support a day-of-week claim.
    df = series("2026-01-01", 8, "3h", [100] * 8)
    out = _analyze(df)
    assert out["status"] == "insufficient"
    assert out["byWeekday"] == []
    assert out["needDays"] == MIN_DISTINCT_DAYS


def test_reports_how_many_days_it_has_versus_needs():
    # The UI shows this so a user knows it's cold start, not breakage.
    df = series("2026-01-01", 3 * 8, "3h", [100] * 24)
    out = _analyze(df)
    assert out["status"] == "insufficient"
    assert out["distinctDays"] == 3


def test_analyzes_once_enough_distinct_days_exist():
    df = series("2026-01-01", MIN_DISTINCT_DAYS, "1D", [100] * MIN_DISTINCT_DAYS)
    out = _analyze(df)
    assert out["status"] == "ok"
    assert out["distinctDays"] == MIN_DISTINCT_DAYS


def test_flat_series_indexes_every_weekday_at_one():
    # 1.0 means "average"; a flat week must not manufacture a pattern.
    df = series("2026-01-05", 14, "1D", [100] * 14)  # 2026-01-05 is a Monday
    out = _analyze(df)
    assert {d["label"] for d in out["byWeekday"]} == {
        "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"
    }
    for d in out["byWeekday"]:
        assert d["index"] == pytest.approx(1.0)


def test_detects_a_weekend_lift():
    # Mon-Fri at 100, Sat/Sun at 200 over two weeks. The mean is
    # (5*100 + 2*200)/7 = 128.57, so the weekend index is 200/128.57 = 1.556.
    values = []
    for _ in range(2):
        values += [100] * 5 + [200] * 2
    df = series("2026-01-05", 14, "1D", values)  # starts Monday
    out = _analyze(df)
    by_label = {d["label"]: d["index"] for d in out["byWeekday"]}
    assert by_label["Sat"] == pytest.approx(1.556, abs=0.01)
    assert by_label["Sun"] == pytest.approx(1.556, abs=0.01)
    assert by_label["Mon"] == pytest.approx(0.778, abs=0.01)
    assert by_label["Sat"] > by_label["Mon"]


def test_hourly_view_is_withheld_until_enough_distinct_hours():
    # Daily snapshots at a fixed hour give 1 distinct hour — no hourly claim.
    df = series("2026-01-05", 14, "1D", [100] * 14)
    assert _analyze(df)["byHour"] == []


def test_hourly_view_appears_with_full_hour_coverage():
    n = 24 * MIN_DISTINCT_DAYS
    df = series("2026-01-05", n, "1h", [100] * n)
    out = _analyze(df)
    assert len(out["byHour"]) == 24


def test_index_values_are_json_safe_floats():
    # Payload is JSON-serialized into AnalyticsResult; numpy floats would break it.
    df = series("2026-01-05", 14, "1D", np.array([100] * 14))
    out = _analyze(df)
    assert all(isinstance(d["index"], float) for d in out["byWeekday"])
    assert isinstance(out["distinctDays"], int)


def test_weekday_hour_cells_are_indexed_in_utc_with_counts():
    # Two weeks every 3h: 7 weekdays x 8 hours, each cell seen twice. Players are
    # doubled at 12:00 UTC only, so that hour's cells sit above average.
    idx = pd.date_range("2026-01-05", periods=14 * 8, freq="3h", tz="UTC")
    values = [200 if t.hour == 12 else 100 for t in idx]
    out = _analyze(pd.DataFrame({"collectedAt": idx, "totalPlaying": values}))
    cells = out["byWeekdayHour"]
    assert len(cells) == 7 * 8
    assert all(c["n"] == 2 for c in cells)
    noon = {c["index"] for c in cells if c["hour"] == 12}
    other = {c["index"] for c in cells if c["hour"] != 12}
    assert len(noon) == 1 and len(other) == 1
    assert noon.pop() == pytest.approx(2 * other.pop())


def test_all_zero_series_does_not_divide_by_zero():
    df = series("2026-01-05", 14, "1D", [0] * 14)
    out = _analyze(df)
    assert out["byWeekday"] == [] and out["byWeekdayHour"] == []
