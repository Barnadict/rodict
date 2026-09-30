"""Task #25 — Change-point / anomaly detection.

Auto-flags player spikes and drops (game updates, viral moments, sudden decline)
on each game's player curve and each genre's total-players curve, using a robust
z-score on successive percent changes: an anomaly is a step whose magnitude is
far from the game's own typical step size (median +/- MAD), so it adapts to each
game's natural volatility rather than a global threshold.

Robust (median/MAD) rather than mean/std so a single big jump doesn't hide the
next one. Cold-start: needs a handful of points and non-zero typical variation;
until then most series flag nothing, which is correct.

A flagged step must clear TWO independent bars: statistically unusual for this
series (z-score) AND materially large in absolute terms (MIN_ABS_CHANGE). The
z-score alone is not enough, because it only measures "unusual for this series"
and says nothing about "worth telling a developer about" — on a very regular
curve the typical step is tiny, so MAD shrinks and an ordinary 2% wiggle scores
z=36. Two real failure modes this closes (both found by the Task #37 tests):
low-noise oscillation reported as +/-5% "notable changes", and the tail of a
smooth decline reported as a series of drops when nothing actually happened.

Re-tuned for the ~5.3K-game corpus (Task #55). Two more bars, both about noise
the 30-game tuning set never had:
  - MIN_ABS_PLAYERS: half the corpus sits below 50 players, where 8 -> 12 is
    +50% and routinely clears both bars above. A step must also move at least
    this many players.
  - Steps across a collection gap longer than MAX_GAP_DAYS are not compared:
    a change measured across e.g. the 2026-08-20 -> 2026-09-29 outage is weeks
    of unobserved drift, not an event at the timestamp it lands on.
The global payload also records how many series were checked and how many
flagged, so the per-game anomaly rate is visible after every run.

Measured against production (Task #76, 2026-09-30, 5,308 games, ~1.19M
snapshots): the #55 rules still flagged 48.7% of games (8,076 anomalies, 96%
"spikes"). Sampled flags were mostly ordinary daily-cycle rebounds. Three causes,
three changes:
  - Percent change is lopsided: a fall 509 -> 206 is -60% but the climb back
    206 -> 387 is +88%, so morning ramps out-scored the drops that caused them.
    The z-score is now on the log ratio, which is symmetric, so a fall and the
    matching recovery score the same. (The +/-25% bar and the payload still
    use percent change, which is what the UI shows.)
  - A step spanning more time than usual (the 6h first step after the outage,
    or a missed run) moves further than the series' 3h steps. Steps longer than
    MAX_STEP_SPACING x the series' median spacing are no longer compared. This
    removed all 648 flags dated 2026-09-29. It's relative, so games on the
    24h low-activity cadence (Task #46) are judged against their own spacing.
  - Z_THRESHOLD 3.5 -> 5. On the log scale a daily cycle's ramps still reach
    z 3.5-4.5. At 5, a random sample was mostly real events: update launches
    that held, games dropping to 0 for maintenance, one-reading viral peaks.
Result on the same data: 10.9% of games flagged, 1,133 anomalies, 617 spikes /
516 drops, none dated 2026-09-29.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import AnalyticsData, Connection, run_standalone, write_results
from deadrule import MAX_GAP_DAYS

KIND = "change_point"
MIN_POINTS = 4
Z_THRESHOLD = 5.0
MAD_TO_STD = 1.4826
# Minimum |percent change| for a step to count as notable, regardless of how
# unusual it is for the series. Real update/viral effects move a curve tens of
# percent (a verified spike in testing was +165%); this floor is what keeps
# statistical outliers that nobody would call an event out of the UI.
MIN_ABS_CHANGE = 0.25
# Minimum |change in players| for a flagged step. Matches the collector's busy
# tier (COLLECTION_CADENCE.busyMinPlaying): a game that never moves 50 players
# at once has no change worth a "notable" label, whatever its percentage.
MIN_ABS_PLAYERS = 50
# A step spanning more than this multiple of the series' median spacing isn't
# compared (Task #76): it had longer to move than the steps it'd be judged by.
MAX_STEP_SPACING = 1.5


def _anomalies(times: list, values: np.ndarray) -> list[dict]:
    """Flag steps that are both unusual for this series and materially large."""
    if len(values) < MIN_POINTS:
        return []
    prev = values[:-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        pct = np.where(prev > 0, (values[1:] - prev) / prev, 0.0)
    # Symmetric step size for the z-score (Task #76): a fall and the matching
    # recovery score the same. log1p keeps zero readings finite.
    step = np.log1p(values[1:]) - np.log1p(prev)
    # Steps spanning a collection gap, or much longer than the series' usual
    # spacing, are neither flagged nor allowed to shape its typical step size.
    spacing = np.array([(times[i + 1] - times[i]).total_seconds() for i in range(len(pct))])
    observed = spacing <= pd.Timedelta(days=MAX_GAP_DAYS).total_seconds()
    if observed.any():
        observed &= spacing <= MAX_STEP_SPACING * np.median(spacing[observed])
    if observed.sum() < MIN_POINTS - 1:
        return []
    med = np.median(step[observed])
    mad = np.median(np.abs(step[observed] - med))
    if mad <= 1e-9:
        return []  # no typical variation to compare against yet
    z = (step - med) / (MAD_TO_STD * mad)

    out = []
    for i, zi in enumerate(z):
        if (
            observed[i]
            and abs(zi) >= Z_THRESHOLD
            and abs(pct[i]) >= MIN_ABS_CHANGE
            and abs(values[i + 1] - values[i]) >= MIN_ABS_PLAYERS
        ):
            out.append(
                {
                    "at": times[i + 1].isoformat(timespec="milliseconds"),
                    "value": int(values[i + 1]),
                    "prevValue": int(values[i]),
                    "changePct": round(float(pct[i]), 4),
                    "direction": "spike" if step[i] > 0 else "drop",
                    "score": round(float(abs(zi)), 2),
                }
            )
    return out


def run(con: Connection, data: AnalyticsData) -> dict:
    games = data.games
    gname = dict(zip(games["id"], games["name"]))
    genres = data.genres
    genre_name = dict(zip(genres["id"], genres["name"]))
    gensnaps = data.genre_snapshots

    results = []
    recent = []  # global feed of the most notable changes
    games_checked = 0

    for gid, gs in data.snaps_by_game().items():
        games_checked += 1
        an = _anomalies(gs["collectedAt"].to_list(), gs["playing"].to_numpy(dtype=float))
        if an:
            results.append({"scopeType": "game", "scopeId": gid,
                            "payload": {"nAnomalies": len(an), "anomalies": an}})
            for a in an:
                recent.append({"scope": "game", "id": gid, "name": gname.get(gid, ""), **a})

    for genid, gg in gensnaps.groupby("genreId"):
        an = _anomalies(gg["collectedAt"].to_list(), gg["totalPlaying"].to_numpy(dtype=float))
        if an:
            results.append({"scopeType": "genre", "scopeId": genid,
                            "payload": {"nAnomalies": len(an), "anomalies": an}})
            for a in an:
                recent.append({"scope": "genre", "id": genid, "name": genre_name.get(genid, ""), **a})

    recent.sort(key=lambda a: a["score"], reverse=True)
    results.append({"scopeType": "global", "scopeId": None,
                    "payload": {
                        "recent": recent[:20],
                        "nTotal": len(recent),
                        # Per-game anomaly rate (Task #55): series checked vs flagged.
                        "nGamesChecked": games_checked,
                        "nGamesFlagged": sum(1 for r in results if r["scopeType"] == "game"),
                    }})

    return write_results(con, KIND, results)


if __name__ == "__main__":
    print(f"change_point: {run_standalone(run)}")
