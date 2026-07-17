"""Tests for the "dead" rule (Task #37).

The dead rule is a LOCKED project decision — "<5% of all-time peak for 7+
consecutive days" — and it's the event definition the whole survival analysis
(Task #21) is built on. If this drifts, every median-lifespan figure on the site
silently changes meaning, so the boundaries are pinned down exactly.
"""
from __future__ import annotations

import pandas as pd
import pytest

from deadrule import DEAD_DAYS, DEAD_FRACTION, detect_death


def snaps(points: list[tuple[str, int]]) -> pd.DataFrame:
    """[(iso_time, playing), ...] -> the ascending frame detect_death expects."""
    return pd.DataFrame(
        {
            "collectedAt": pd.to_datetime([p[0] for p in points], utc=True),
            "playing": [p[1] for p in points],
        }
    )


def test_returns_none_when_peak_is_zero():
    # No peak means no threshold to compare against — a game we've never seen
    # populated can't be declared dead.
    df = snaps([("2026-01-01", 0), ("2026-02-01", 0)])
    assert detect_death(df, 0) is None


def test_returns_none_for_empty_series():
    assert detect_death(snaps([]), 1000) is None


def test_returns_none_for_a_healthy_game():
    df = snaps([("2026-01-01", 900), ("2026-01-15", 950), ("2026-02-01", 1000)])
    assert detect_death(df, 1000) is None


def test_detects_death_after_sustained_decline():
    # Peak 1000 -> threshold 50. Below it from 2026-01-10 through 2026-01-25.
    df = snaps(
        [
            ("2026-01-01", 1000),
            ("2026-01-10", 40),
            ("2026-01-18", 30),
            ("2026-01-25", 20),
        ]
    )
    death = detect_death(df, 1000)
    assert death == pd.Timestamp("2026-01-10", tz="UTC")


def test_reports_the_start_of_the_run_not_the_confirming_snapshot():
    # The game died when it dropped, not when we noticed 7 days later.
    df = snaps([("2026-03-01", 1000), ("2026-03-02", 10), ("2026-03-20", 10)])
    assert detect_death(df, 1000) == pd.Timestamp("2026-03-02", tz="UTC")


def test_does_not_declare_death_before_the_required_span():
    # Below threshold for only 6 days — a bad week is not a death.
    df = snaps([("2026-01-01", 1000), ("2026-01-10", 10), ("2026-01-16", 10)])
    assert detect_death(df, 1000) is None


def test_exactly_seven_days_counts_as_death():
    # The rule is ">= 7 days"; this is the inclusive boundary.
    df = snaps([("2026-01-01", 1000), ("2026-01-10", 10), ("2026-01-17", 10)])
    assert detect_death(df, 1000) == pd.Timestamp("2026-01-10", tz="UTC")


def test_recovery_resets_the_run():
    # Drops, recovers well above threshold, then drops again and stays down.
    # Death must be dated from the SECOND drop, not the first.
    df = snaps(
        [
            ("2026-01-01", 1000),
            ("2026-01-05", 10),  # first drop
            ("2026-01-08", 800),  # recovered — resets
            ("2026-01-10", 10),  # second drop
            ("2026-01-20", 10),  # sustained
        ]
    )
    assert detect_death(df, 1000) == pd.Timestamp("2026-01-10", tz="UTC")


def test_recovery_before_the_span_elapses_prevents_death():
    df = snaps(
        [
            ("2026-01-01", 1000),
            ("2026-01-05", 10),
            ("2026-01-09", 900),  # recovers on day 4 of the run
            ("2026-01-12", 950),
        ]
    )
    assert detect_death(df, 1000) is None


def test_threshold_is_strictly_below_five_percent():
    # Exactly 5% of peak is NOT below the threshold (`playing < threshold`), so a
    # game sitting precisely at 5% stays alive.
    at_threshold = int(DEAD_FRACTION * 1000)  # 50
    df = snaps([("2026-01-01", at_threshold), ("2026-02-01", at_threshold)])
    assert detect_death(df, 1000) is None

    # One player fewer, and the same series is dead.
    df_below = snaps([("2026-01-01", at_threshold - 1), ("2026-02-01", at_threshold - 1)])
    assert detect_death(df_below, 1000) is not None


def test_threshold_scales_with_each_games_own_peak():
    # 400 players is dead for a 10k-peak game but healthy for a 1k-peak one —
    # the rule is relative, never an absolute player count.
    df = snaps([("2026-01-01", 400), ("2026-02-01", 400)])
    assert detect_death(df, 10_000) is not None
    assert detect_death(df, 1_000) is None


def test_cold_start_series_of_minutes_is_never_dead():
    # A few snapshots minutes apart can't span DEAD_DAYS, so nothing is declared
    # dead during cold start — correct, not a failure.
    df = snaps(
        [
            ("2026-07-16T12:00:00", 0),
            ("2026-07-16T15:00:00", 0),
            ("2026-07-16T18:00:00", 0),
        ]
    )
    assert detect_death(df, 1000) is None


@pytest.mark.parametrize("days,expected_death", [(DEAD_DAYS - 1, False), (DEAD_DAYS, True)])
def test_span_boundary(days: int, expected_death: bool):
    start = pd.Timestamp("2026-01-10", tz="UTC")
    df = pd.DataFrame(
        {
            "collectedAt": [start, start + pd.Timedelta(days=days)],
            "playing": [1, 1],
        }
    )
    assert (detect_death(df, 1000) is not None) is expected_death
