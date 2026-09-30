"""The operational "dead" rule (a locked project decision):

A game is DEAD when its concurrent player count stays below ~5% of the game's
all-time peak for 7+ consecutive days.

`detect_death` finds the death timestamp from a game's snapshot series, or None
if the game never satisfied the rule within our observation window. Under
cold-start (a few snapshots over minutes) this returns None for everything,
which is correct — nothing has been observed dead yet.
"""
from __future__ import annotations

from datetime import timedelta

import pandas as pd

DEAD_FRACTION = 0.05
DEAD_DAYS = 7
# The longest gap between two consecutive snapshots that still counts as
# "continuously observed". Low-activity games are sampled about daily (Task #46),
# and a partial run can skip one, so 3 days allows for that. A longer gap (e.g.
# the 2026-08-20 -> 2026-09-29 collection outage) breaks the run: nobody saw
# the game in between, so it can't count toward the 7 consecutive days.
MAX_GAP_DAYS = 3


def detect_death(snaps: pd.DataFrame, peak: int) -> pd.Timestamp | None:
    """snaps: columns collectedAt (UTC) + playing, ascending. peak: all-time peak.

    Returns the timestamp the game first dropped below the threshold and then
    stayed below it for >= DEAD_DAYS, or None.
    """
    if peak <= 0 or snaps.empty:
        return None
    threshold = DEAD_FRACTION * peak

    below = snaps["playing"] < threshold
    times = snaps["collectedAt"].to_list()
    flags = below.to_list()

    run_start: pd.Timestamp | None = None
    prev_t: pd.Timestamp | None = None
    for t, is_below in zip(times, flags):
        if prev_t is not None and t - prev_t > timedelta(days=MAX_GAP_DAYS):
            run_start = None  # unobserved stretch — the streak can't span it
        prev_t = t
        if is_below:
            if run_start is None:
                run_start = t
            # sustained below threshold for the required span?
            if t - run_start >= timedelta(days=DEAD_DAYS):
                return run_start
        else:
            run_start = None
    return None


def current_death(snaps: pd.DataFrame, peak: int) -> pd.Timestamp | None:
    """When the game's CURRENT death began, or None if it isn't dead now.

    Same rule as `detect_death`, but judged at the latest reading: the run of
    below-threshold readings must reach the end of the series and span
    >= DEAD_DAYS. A game that died and later recovered is alive again here
    (while `detect_death` still reports its first death, which is the lifetime
    event survival analysis counts). Backs Game.status / Game.deadSince.
    """
    if peak <= 0 or snaps.empty:
        return None
    threshold = DEAD_FRACTION * peak

    run_start: pd.Timestamp | None = None
    prev_t: pd.Timestamp | None = None
    for t, playing in zip(snaps["collectedAt"].to_list(), snaps["playing"].to_list()):
        if prev_t is not None and t - prev_t > timedelta(days=MAX_GAP_DAYS):
            run_start = None
        prev_t = t
        if playing < threshold:
            if run_start is None:
                run_start = t
        else:
            run_start = None
    if run_start is not None and prev_t - run_start >= timedelta(days=DEAD_DAYS):
        return run_start
    return None
