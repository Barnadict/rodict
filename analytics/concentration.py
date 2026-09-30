"""Task #87 — Market concentration per genre.

For each UTC day, how much of a genre's players its biggest games hold: the
top-1, top-5 and top-10 shares of the genre's total, and the Herfindahl-Hirschman
index (HHI, the sum of squared shares, 0–1). 1 / HHI is the "effective number
of games": a genre whose HHI is 0.25 behaves like four equal games. Says
whether a genre is many small games or a few giants.

Computed on each game's daily average players (db.daily_game_averages), so a
busy game collected 8 times a day doesn't count 8 times against a quiet game
collected once. Games are grouped by their current genre, like the other
per-genre jobs. A day counts when the genre has at least MIN_GAMES games with
a reading and more than zero players. Days with no collection (e.g. the
2026-08-20 → 2026-09-29 pause) are simply absent, never zero.

Writes one row per genre, diff-based. The latest (partial) day changes every
collection, so a run typically updates each genre's row once — ~20 writes.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import AnalyticsData, Connection, run_standalone, write_results

KIND = "concentration"
MIN_GAMES = 5
TOP_K = (1, 5, 10)
MAX_DAYS = 365  # keeps each row's payload bounded (~35 KB)


def day_point(values: np.ndarray) -> dict | None:
    """One genre-day from its games' daily averages, or None if too thin."""
    total = float(values.sum())
    if len(values) < MIN_GAMES or total <= 0:
        return None
    ordered = np.sort(values)[::-1]
    shares = ordered / total
    hhi = float((shares**2).sum())
    point = {"n": int(len(values)), "total": round(total, 1)}
    for k in TOP_K:
        point[f"top{k}"] = round(float(shares[:k].sum()), 4)
    point["hhi"] = round(hhi, 4)
    return point


def genre_series(daily: pd.DataFrame, genre_of: dict[str, str]) -> dict[str, list[dict]]:
    """genreId -> [{day, n, total, top1, top5, top10, hhi}] oldest first."""
    if daily.empty:
        return {}
    d = daily.assign(genreId=daily["gameId"].map(genre_of))
    d = d[d["genreId"].notna()]
    if not d.empty:
        d = d[d["day"] > d["day"].max() - pd.Timedelta(days=MAX_DAYS)]
    out: dict[str, list[dict]] = {}
    for (genre_id, day), rows in d.groupby(["genreId", "day"], sort=True):
        point = day_point(rows["avg"].to_numpy(dtype=float))
        if point is None:
            continue
        out.setdefault(genre_id, []).append({"day": day.strftime("%Y-%m-%d"), **point})
    return out


def run(con: Connection, data: AnalyticsData) -> dict:
    genre_of = {
        gid: genre
        for gid, genre in zip(data.games["id"], data.games["currentGenreId"])
        if isinstance(genre, str)
    }
    series = genre_series(data.daily_game_averages(), genre_of)
    results = [
        {
            "scopeType": "genre",
            "scopeId": gen.id,
            "payload": {
                "minGames": MIN_GAMES,
                "days": series.get(gen.id, []),
            },
        }
        for gen in data.genres.itertuples()
    ]
    return write_results(con, KIND, results)


if __name__ == "__main__":
    print(f"concentration: {run_standalone(run)}")
