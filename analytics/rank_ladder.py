"""Task #90 — Daily rank ladders, for rank history on the game page.

A game's rank on a day is 1 + the number of games with a higher daily average.
Storing each game's rank every day would be one row (or one payload entry) per
game per day. Instead, each day stores the *ladder*: every genre's sorted
daily averages. The game page reads the ladders, works out the game's own daily
average from the snapshots it already loads, and counts how many values beat
it — overall across all genres, and in its own genre.

Both sides must round the same way, or a game would be ranked below itself.
Values are rounded to whole players with floor(x + 0.5), which is exactly JS
Math.round for these non-negative numbers (see src/lib/rank-history.ts), and the
page uses the same UTC days and only readings up to the day's stored `until`.
Games averaging under MIN_PLAYERS that day are left off the ladder (their rank
would mean little and they're most of the corpus); the page shows no rank for
them. `n` still counts every game with a reading, for "#12 of 4,321".

Rows: one per day for the last KEEP_DAYS days, keyed (global, "YYYY-MM-DD"),
diff-based. Only the latest day (still filling in) and a day that just ended
change, and the oldest day drops off once a day, so a run writes ~1–3 rows.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import AnalyticsData, Connection, iso_prisma, run_standalone, write_results

KIND = "rank_ladder"
KEEP_DAYS = 90
MIN_PLAYERS = 1
UNCLASSIFIED = "_"


def round_players(values: np.ndarray) -> np.ndarray:
    """Whole players, half up — the same as JS Math.round for x >= 0."""
    return np.floor(values + 0.5).astype(int)


def day_ladder(rows: pd.DataFrame) -> dict:
    """One day's ladder from rows of gameId, genreKey, avg."""
    counts: dict[str, int] = {}
    ladders: dict[str, list[int]] = {}
    for key, g in rows.groupby("genreKey", sort=True):
        counts[key] = int(len(g))
        values = round_players(g["avg"].to_numpy(dtype=float))
        values = np.sort(values[values >= MIN_PLAYERS])[::-1]
        if len(values):
            ladders[key] = [int(v) for v in values]
    return {"n": counts, "v": ladders}


def ladders(data: AnalyticsData) -> list[dict]:
    """[{day, until, n, v}] for the last KEEP_DAYS days with readings, oldest first."""
    daily = data.daily_game_averages()
    snaps = data.game_snapshots
    if daily.empty:
        return []
    last_day = daily["day"].max()
    daily = daily[daily["day"] > last_day - pd.Timedelta(days=KEEP_DAYS)]
    genre_of = {
        gid: genre
        for gid, genre in zip(data.games["id"], data.games["currentGenreId"])
        if isinstance(genre, str)
    }
    daily = daily.assign(genreKey=daily["gameId"].map(genre_of).fillna(UNCLASSIFIED))
    until = snaps.groupby(snaps["collectedAt"].dt.floor("D"))["collectedAt"].max()

    out = []
    for day, rows in daily.groupby("day", sort=True):
        out.append({"day": day, "until": until[day], **day_ladder(rows)})
    return out


def run(con: Connection, data: AnalyticsData) -> dict:
    results = [
        {
            "scopeType": "global",
            "scopeId": d["day"].strftime("%Y-%m-%d"),
            "periodStart": iso_prisma(d["day"]),
            "periodEnd": iso_prisma(d["until"]),
            "payload": {"minPlayers": MIN_PLAYERS, "n": d["n"], "v": d["v"]},
        }
        for d in ladders(data)
    ]
    return write_results(con, KIND, results)


if __name__ == "__main__":
    print(f"rank_ladder: {run_standalone(run)}")
