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
    for t, is_below in zip(times, flags):
        if is_below:
            if run_start is None:
                run_start = t
            # sustained below threshold for the required span?
            if t - run_start >= timedelta(days=DEAD_DAYS):
                return run_start
        else:
            run_start = None
    return None
