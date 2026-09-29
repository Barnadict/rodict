"""Task #63 — Update/relaunch impact per genre.

For every recorded update (a change in Roblox's "last updated" timestamp, kept
in the GameUpdate table), compare the game's average players in the 24h/72h
before it with the same span after it, then summarize those changes per genre:
median, quartiles and the share that rose.

Same windows and rules as the game page (src/lib/update-impact.ts); keep them
in step. An update only counts toward a genre when:
  - its after-window has fully elapsed and both sides have readings,
  - no other update of the same game falls inside the window (its effect
    couldn't be separated), and
  - the game averaged at least MIN_BASELINE players before it, since a move
    from 3 to 6 players is +100% and says nothing.
Observational, not causal: see the page copy. Genres with fewer than MIN_UPDATES
measured updates in a window report status="insufficient" for it.

Writes one row per genre, diff-based (an unchanged run writes nothing).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import AnalyticsData, Connection, run_standalone, write_results

KIND = "update_impact"
WINDOWS_HOURS = (24, 72)
MIN_BASELINE = 50
MIN_UPDATES = 5


def measure(
    updated_at: pd.Timestamp,
    hours: int,
    snaps: pd.DataFrame,
    other_updates: list[pd.Timestamp],
    now: pd.Timestamp,
) -> dict:
    """One update over one window: {status, before, after, changePct, overlapped}.

    `snaps` is one game's snapshots sorted by collectedAt. Mirrors
    measureUpdateWindow in src/lib/update-impact.ts.
    """
    span = pd.Timedelta(hours=hours)
    times = snaps["collectedAt"]
    playing = snaps["playing"].to_numpy(dtype=float)
    lo = times.searchsorted(updated_at - span, side="left")
    mid_lo = times.searchsorted(updated_at, side="left")  # before: [T - span, T)
    mid_hi = times.searchsorted(updated_at, side="right")  # after: (T, T + span]
    hi = times.searchsorted(updated_at + span, side="right")
    before_vals = playing[lo:mid_lo]
    after_vals = playing[mid_hi:hi]
    before = float(before_vals.mean()) if len(before_vals) else None
    after = float(after_vals.mean()) if len(after_vals) else None
    overlapped = any(
        pd.Timedelta(0) < abs(u - updated_at) < span for u in other_updates
    )

    if updated_at + span > now:
        status = "pending"
    elif before is None or after is None:
        status = "no_data"
    else:
        status = "ok"
    change = after / before - 1 if status == "ok" and before > 0 else None
    return {
        "status": status,
        "before": before,
        "after": after,
        "changePct": change,
        "overlapped": overlapped,
    }


def summarize(changes: list[float], hours: int) -> dict:
    """Distribution of one window's changes across a genre's updates."""
    n = len(changes)
    if n < MIN_UPDATES:
        return {"hours": hours, "status": "insufficient", "n": n, "needUpdates": MIN_UPDATES}
    arr = np.asarray(changes, dtype=float)
    return {
        "hours": hours,
        "status": "ok",
        "n": n,
        "medianChangePct": round(float(np.median(arr)), 4),
        "p25ChangePct": round(float(np.percentile(arr, 25)), 4),
        "p75ChangePct": round(float(np.percentile(arr, 75)), 4),
        "shareUp": round(float((arr > 0).mean()), 4),
    }


def genre_changes(data: AnalyticsData) -> dict[str, dict[int, list[float]]]:
    """genreId -> window hours -> the qualifying updates' relative changes."""
    updates = data.game_updates
    if updates.empty or data.game_snapshots.empty:
        return {}
    genre_of = data.games.set_index("id")["currentGenreId"].to_dict()
    by_game = data.snaps_by_game()
    now = data.now

    out: dict[str, dict[int, list[float]]] = {}
    for game_id, rows in updates.groupby("gameId", sort=False):
        genre_id = genre_of.get(game_id)
        snaps = by_game.get(game_id)
        if not isinstance(genre_id, str) or snaps is None:
            continue
        times = [t for t in rows["updatedAt"] if not pd.isna(t)]
        for t in times:
            for hours in WINDOWS_HOURS:
                m = measure(t, hours, snaps, times, now)
                if m["changePct"] is None or m["overlapped"] or m["before"] < MIN_BASELINE:
                    continue
                out.setdefault(genre_id, {}).setdefault(hours, []).append(m["changePct"])
    return out


def run(con: Connection, data: AnalyticsData) -> dict:
    changes = genre_changes(data)
    results = []
    for gen in data.genres.itertuples():
        per_window = changes.get(gen.id, {})
        results.append({
            "scopeType": "genre",
            "scopeId": gen.id,
            "payload": {
                "minBaseline": MIN_BASELINE,
                "windows": [summarize(per_window.get(h, []), h) for h in WINDOWS_HOURS],
            },
        })
    return write_results(con, KIND, results)


if __name__ == "__main__":
    print(f"update_impact: {run_standalone(run)}")
