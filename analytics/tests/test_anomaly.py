"""Tests for change-point / anomaly detection (Task #25, tested in #37).

These flags drive user-visible "Notable changes" claims, so both directions
matter: a missed spike is a lost insight, but a false positive tells a developer
something happened when nothing did.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

import deadrule
from anomaly import MAX_GAP_DAYS, MIN_ABS_CHANGE, MIN_POINTS, _anomalies


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
    # 1000-player scale so MIN_ABS_PLAYERS doesn't interfere with this bar.
    values = [1000.0, 1005.0, 995.0, 1000.0, 1005.0, 1000.0 * (1 + over)]
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


# --- Task #55: re-tuned for a ~5.3K-game corpus -------------------------------

def _hourly(values, start="2026-10-01", step_hours=3):
    t0 = pd.Timestamp(start, tz="UTC")
    return [t0 + pd.Timedelta(hours=step_hours * i) for i in range(len(values))]


def test_small_games_do_not_flag_percentage_jumps_of_a_few_players():
    # A steady ~10-player game jumping to 30 is +200% and a huge z-score, but
    # only 20 players: noise at this size, not a notable change.
    values = np.array([10, 11, 10, 11, 10, 11, 10, 30, 30, 30], dtype=float)
    assert _anomalies(_hourly(values), values) == []


def test_large_games_still_flag_the_same_relative_jump():
    values = np.array([1000, 1010, 1000, 1010, 1000, 1010, 1000, 3000, 3000, 3000], dtype=float)
    an = _anomalies(_hourly(values), values)
    assert [a["direction"] for a in an] == ["spike"]
    assert an[0]["value"] == 3000


def test_steps_across_a_collection_gap_are_not_flagged():
    values = np.array([1000, 1010, 1000, 1010, 1000, 200, 205, 200, 205, 200], dtype=float)
    times = _hourly(values[:5]) + _hourly(values[5:], start="2026-11-10")
    assert _anomalies(times, values) == []


def test_gap_threshold_matches_the_dead_rule():
    assert MAX_GAP_DAYS == deadrule.MAX_GAP_DAYS


# --- Task #76: measured against production ------------------------------------

def _daily_cycle(days=4, base=400, swing=0.6):
    # 3-hourly readings of a game whose players swing +/-60% over each day,
    # with the steepest ramp around the morning trough, as in production.
    shape = [1.0, 0.7, 0.4, 0.45, 0.8, 1.2, 1.5, 1.3]
    return np.array([base * (1 + swing * (s - 0.9)) for _ in range(days) for s in shape])


def test_the_morning_rebound_of_a_daily_cycle_is_not_flagged():
    # The #55 rules flagged ~half the corpus, mostly this: percent change made
    # each day's climb out of the trough look bigger than the fall into it.
    values = _daily_cycle()
    assert _anomalies(_hourly(values), values) == []


def test_a_fall_and_its_recovery_score_the_same():
    values = np.array([1000, 1010, 995, 1005, 1000, 1010, 250, 1000, 1005, 995], dtype=float)
    an = _anomalies(_hourly(values), values)
    assert [a["direction"] for a in an] == ["drop", "spike"]
    # Equal up to the series' median step and log1p's +1. Under percent change
    # (-75% vs +300%) the recovery scored ~4x the fall.
    assert an[1]["score"] == pytest.approx(an[0]["score"], rel=0.05)


def test_a_step_much_longer_than_the_series_usual_spacing_is_not_flagged():
    # The first step after the outage was 6h against a 3h cadence: it had twice
    # as long to move, so it isn't judged against the 3h steps.
    values = np.array([1000, 1010, 1000, 1010, 1000, 1010, 1000, 3000], dtype=float)
    times = _hourly(values[:7]) + [_hourly(values)[6] + pd.Timedelta(hours=6)]
    assert _anomalies(times, values) == []
    assert len(_anomalies(_hourly(values), values)) == 1  # the same step at 3h is


def test_a_daily_cadence_game_is_judged_by_its_own_spacing():
    # Low-activity games are collected every 24h (Task #46); the spacing rule
    # is relative, so their steps are still compared.
    values = np.array([1000, 1010, 1000, 1010, 1000, 1010, 1000, 3000], dtype=float)
    assert len(_anomalies(_hourly(values, step_hours=24), values)) == 1
