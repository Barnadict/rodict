"""Tests for the forecast's time anchor (Task #57).

The chart places projection steps on a real time axis, so each payload says when
it starts and how long a step is. An old outage gap must not stretch the step.
"""
from __future__ import annotations

import pandas as pd

from forecast import _time_anchor


def test_anchor_is_the_last_point_and_step_the_recent_spacing():
    old = pd.date_range("2026-08-01", periods=10, freq="3h", tz="UTC")
    new = pd.date_range("2026-09-29", periods=10, freq="3h", tz="UTC")
    times = pd.Series(old.append(new))
    out = _time_anchor(times)
    assert out["lastAt"] == "2026-09-30T03:00:00.000Z"
    assert out["stepHours"] == 3.0


def test_single_point_has_an_anchor_but_no_step():
    out = _time_anchor(pd.Series(pd.to_datetime(["2026-09-29T00:00:00Z"], utc=True)))
    assert out == {"lastAt": "2026-09-29T00:00:00.000Z"}
