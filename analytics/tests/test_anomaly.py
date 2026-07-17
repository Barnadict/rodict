"""Tests for change-point / anomaly detection (Task #25, tested in #37).

These flags drive user-visible "Notable changes" claims, so both directions
matter: a missed spike is a lost insight, but a false positive tells a developer
something happened when nothing did.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from anomaly import MIN_ABS_CHANGE, MIN_POINTS, _anomalies


def times(n: int) -> list[pd.Timestamp]:
    return list(pd.date_range("2026-01-01", periods=n, freq="3h", tz="UTC"))


def run(values: list[float]) -> list[dict]:
    return _anomalies(times(len(values)), np.array(values, dtype=float))


def test_too_few_points_flags_nothing():
    # Cold start: not enough history to know what "typical" even is.
    assert run([100, 500, 100]) == []
    assert len(run([100] * (MIN_POINTS - 1))) == 0


def test_flat_series_flags_nothing():
    # Zero variation -> MAD is 0 -> no scale to judge against. Must not divide
    # by zero or flag everything.
    assert run([100, 100, 100, 100, 100]) == []


def test_steady_series_with_normal_jitter_flags_nothing():
    # The most important negative case: ordinary noise is not an anomaly.
    # This series is a regression test for a real bug — its percent changes
    # cluster so tightly that MAD collapses to ~0.0009, scoring a mundane -2%
    # wiggle at z=36. The z-score alone flagged 3 of these 7 steps as "notable
    # changes"; the MIN_ABS_CHANGE bar is what keeps them out.
    assert run([100, 103, 98, 101, 99, 102, 97, 100]) == []


def test_smooth_decline_is_not_a_change_point():
    # A dying game's curve has no event in it — nothing *happened*. But a linear
    # decline's percent steps grow as the absolute value shrinks (60->50 is
    # -17%), so late steps look unusual to a pure z-score and used to be flagged
    # as drops. A decline is a trend, and trends are momentum's job (Task #22).
    decline = [1000, 800, 640, 512, 410, 328, 262, 210, 168, 134, 107, 86]
    assert run(decline) == []


def test_a_step_must_be_materially_large_not_just_statistically_unusual():
    # The floor is on the absolute percent change, independent of the z-score:
    # "unusual for this series" does not imply "worth reporting".
    below = MIN_ABS_CHANGE - 0.05
    values = [100.0, 100.5, 99.5, 100.0, 100.5, 100.0 * (1 + below)]
    assert run(values) == []


def test_a_step_just_over_the_materiality_bar_is_still_flagged():
    # Guards the other direction — the floor must not swallow real events.
    over = MIN_ABS_CHANGE + 0.15
    values = [100.0, 100.5, 99.5, 100.0, 100.5, 100.0 * (1 + over)]
    out = run(values)
    assert len(out) == 1
    assert out[0]["direction"] == "spike"


def test_flags_a_large_spike():
    out = run([100, 102, 98, 101, 99, 500])
    assert len(out) == 1
    assert out[0]["direction"] == "spike"
    assert out[0]["value"] == 500
    assert out[0]["prevValue"] == 99
    assert out[0]["changePct"] > 4  # ~+405%


def test_flags_a_large_drop():
    out = run([500, 505, 495, 500, 498, 10])
    assert len(out) == 1
    assert out[0]["direction"] == "drop"
    assert out[0]["changePct"] < 0


def test_anomaly_is_timestamped_at_the_new_value_not_the_previous_one():
    ts = times(6)
    out = _anomalies(ts, np.array([100, 102, 98, 101, 99, 500], dtype=float))
    assert out[0]["at"] == ts[5].isoformat(timespec="milliseconds")


def test_scale_is_relative_to_each_series_own_volatility():
    # The same +98% jump to 200 is judged against each series' own behavior:
    # unremarkable in a wildly swingy game, a clear event in a calm one.
    assert run([100, 300, 50, 250, 80, 200]) == []
    assert len(run([100, 101, 99, 100, 101, 200])) == 1


def test_one_big_jump_does_not_mask_a_later_one():
    # The reason for median/MAD over mean/std: with mean/std a single huge jump
    # inflates the scale so much that subsequent anomalies fall under threshold.
    out = run([100, 101, 99, 100, 1000, 100, 101, 99, 1000])
    assert len(out) >= 2


def test_growth_from_zero_is_not_flagged():
    # A known, deliberate limitation: percent change is undefined from a zero
    # baseline, so those steps are treated as 0 rather than infinite. A game
    # going 0 -> 100 is therefore not reported as a spike.
    assert run([0, 0, 0, 0, 100]) == []


def test_reported_fields_are_json_safe_scalars():
    # The payload is JSON-serialized into AnalyticsResult; numpy scalars would
    # blow up json.dumps.
    out = run([100, 102, 98, 101, 99, 500])[0]
    assert isinstance(out["value"], int)
    assert isinstance(out["prevValue"], int)
    assert isinstance(out["changePct"], float)
    assert isinstance(out["score"], float)
    assert isinstance(out["at"], str)
