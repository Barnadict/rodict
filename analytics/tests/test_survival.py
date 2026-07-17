"""Tests for survival analysis inputs (Task #21, tested in #37).

The KM fit itself is lifelines' job; what's ours — and what silently biases every
"median lifespan of a {genre} game" figure if wrong — is how each game's
lifetime row is built: censoring, and left truncation for the fact that we start
observing a game at firstSeenAt rather than at its launch.
"""
from __future__ import annotations

import pandas as pd
import pytest

from survival import _build_lifetimes, _fit

WEEK = pd.Timedelta(weeks=1)


def games(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def game_row(
    gid: str = "g1",
    created: str = "2025-01-01",
    first_seen: str = "2026-01-01",
    peak: int = 1000,
) -> dict:
    return {
        "id": gid,
        "robloxCreatedAt": pd.Timestamp(created, tz="UTC"),
        "firstSeenAt": pd.Timestamp(first_seen, tz="UTC"),
        "allTimePeakPlayers": peak,
    }


def snaps(points: list[tuple[str, int]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "collectedAt": pd.to_datetime([p[0] for p in points], utc=True),
            "playing": [p[1] for p in points],
        }
    )


class TestBuildLifetimes:
    def test_alive_game_is_right_censored(self):
        # Still healthy at last observation -> observed=0. Treating it as a death
        # would drag every median lifespan down.
        lt = _build_lifetimes(
            games([game_row()]),
            {"g1": snaps([("2026-01-01", 900), ("2026-02-01", 950)])},
        )
        assert len(lt) == 1
        assert lt.iloc[0]["observed"] == 0

    def test_dead_game_is_marked_observed(self):
        lt = _build_lifetimes(
            games([game_row()]),
            {"g1": snaps([("2026-01-01", 10), ("2026-02-01", 10)])},
        )
        assert lt.iloc[0]["observed"] == 1

    def test_entry_is_the_games_age_when_first_seen_not_zero(self):
        # THE left-truncation guard. Created 2025-01-01, first seen exactly one
        # year later -> the game entered our risk set at ~52 weeks old, not 0.
        # Entering at 0 would credit us with observing a year we never saw and
        # bias survival upward.
        lt = _build_lifetimes(
            games([game_row(created="2025-01-01", first_seen="2026-01-01")]),
            {"g1": snaps([("2026-01-02", 900)])},
        )
        assert lt.iloc[0]["entry"] == pytest.approx(52.14, abs=0.2)

    def test_duration_is_measured_from_launch_not_from_first_seen(self):
        # Lifespan means age-at-death, so the clock starts at the game's launch.
        lt = _build_lifetimes(
            games([game_row(created="2025-01-01", first_seen="2026-01-01")]),
            {"g1": snaps([("2026-01-08", 900)])},
        )
        assert lt.iloc[0]["duration"] == pytest.approx(53.14, abs=0.2)

    def test_entry_stays_strictly_below_duration(self):
        # lifelines rejects entry >= duration. A game first seen at (or after)
        # its last snapshot would produce exactly that, so it's clamped.
        lt = _build_lifetimes(
            games([game_row(created="2025-01-01", first_seen="2026-01-01")]),
            {"g1": snaps([("2026-01-01", 900)])},  # first seen == last snapshot
        )
        assert len(lt) == 1
        assert lt.iloc[0]["entry"] < lt.iloc[0]["duration"]

    def test_skips_games_with_no_launch_date(self):
        # Without robloxCreatedAt there's no clock to measure a lifespan on.
        row = game_row()
        row["robloxCreatedAt"] = pd.NaT
        assert _build_lifetimes(games([row]), {"g1": snaps([("2026-01-01", 900)])}).empty

    def test_skips_games_with_no_snapshots(self):
        assert _build_lifetimes(games([game_row()]), {}).empty

    def test_skips_games_whose_launch_date_is_in_the_future(self):
        # Bad upstream data would otherwise yield a negative lifespan.
        lt = _build_lifetimes(
            games([game_row(created="2027-01-01", first_seen="2026-01-01")]),
            {"g1": snaps([("2026-01-02", 900)])},
        )
        assert lt.empty


class TestFit:
    def test_reports_insufficient_games_below_the_minimum(self):
        lt = _build_lifetimes(
            games([game_row()]), {"g1": snaps([("2026-01-01", 900)])}
        )
        out = _fit(lt)
        assert out["status"] == "insufficient_games"
        assert out["medianLifespanWeeks"] is None

    def test_reports_insufficient_deaths_when_nothing_has_died(self):
        # The cold-start norm: a flat KM curve at 1.0 with an undefined median.
        # Must be reported honestly rather than fit into a fake number.
        rows = [game_row(gid=f"g{i}") for i in range(5)]
        snap_map = {f"g{i}": snaps([("2026-01-01", 900), ("2026-02-01", 950)]) for i in range(5)}
        out = _fit(_build_lifetimes(games(rows), snap_map))
        assert out["status"] == "insufficient_deaths"
        assert out["medianLifespanWeeks"] is None
        assert out["nDeaths"] == 0
        assert out["nGames"] == 5

    def test_handles_an_empty_cohort(self):
        out = _fit(pd.DataFrame())
        assert out["status"] == "insufficient_games"
        assert out["nGames"] == 0
