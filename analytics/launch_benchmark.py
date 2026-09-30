"""Task #83 — Launch benchmarks per genre.

For each day since launch (0…MAX_DAY), the spread of a genre's games' daily
average players: every 5th percentile from p5 to p95, so the game page can
say where a game sits ("Day 14: above 82% of Simulator launches") and the
genre page can draw the p25–p75 band.

Survivorship bias is the trap here: a game we only found in week 6 was found
*because* it was doing well, so counting its week-6 players would inflate the
benchmark. Only games whose first reading came within NEAR_LAUNCH_DAYS of
their Roblox creation date count, and those games are kept after they die
(the collector never drops a game), so flops stay in the baseline.

Each game's readings are averaged per day first, so a busy game collected 8
times a day doesn't outweigh a quiet one collected once. A day is reported
only when at least MIN_GAMES games have a reading on it. Percentiles use
linear interpolation, the same as `quantile` in src/lib/new-releases.ts.

Writes one row per genre, diff-based (an unchanged run writes nothing).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import AnalyticsData, Connection, run_standalone, write_results

KIND = "launch_benchmark"
MAX_DAY = 90
NEAR_LAUNCH_DAYS = 7
MIN_GAMES = 5
# Percentiles stored per day; the frontend reads p25/p50/p75 at indexes 4/9/14.
QUANTILES = list(range(5, 100, 5))

DAY = pd.Timedelta(days=1)


def daily_by_age(data: AnalyticsData) -> pd.DataFrame:
    """One row per (game, day since launch) for near-launch games: genreId, day, avg."""
    games = data.games
    snaps = data.game_snapshots
    empty = pd.DataFrame({"gameId": [], "genreId": [], "day": [], "avg": []})
    if games.empty or snaps.empty:
        return empty

    g = games[games["robloxCreatedAt"].notna() & games["currentGenreId"].notna()]
    g = g[["id", "currentGenreId", "robloxCreatedAt"]].rename(
        columns={"id": "gameId", "currentGenreId": "genreId", "robloxCreatedAt": "createdAt"}
    )
    first = snaps.groupby("gameId", sort=False)["collectedAt"].min().rename("firstAt")
    g = g.join(first, on="gameId", how="inner")
    near = (g["firstAt"] - g["createdAt"]) <= pd.Timedelta(days=NEAR_LAUNCH_DAYS)
    g = g[near]
    if g.empty:
        return empty

    s = snaps.merge(g[["gameId", "genreId", "createdAt"]], on="gameId", how="inner")
    age = s["collectedAt"] - s["createdAt"]
    s = s[(age >= pd.Timedelta(0)) & (age < (MAX_DAY + 1) * DAY)].copy()
    s["day"] = (age[s.index] // DAY).astype(int)
    out = s.groupby(["gameId", "genreId", "day"], sort=False)["playing"].mean()
    return out.rename("avg").reset_index()


def summarize(daily: pd.DataFrame) -> dict:
    """One genre's per-day percentiles from its games' daily averages."""
    n_games = int(daily["gameId"].nunique()) if not daily.empty else 0
    days = []
    for day, rows in daily.groupby("day", sort=True):
        values = rows["avg"].to_numpy(dtype=float)
        if len(values) < MIN_GAMES:
            continue
        q = np.percentile(values, QUANTILES)
        days.append({"day": int(day), "n": len(values), "q": [round(float(v), 1) for v in q]})
    return {
        "status": "ok" if days else "insufficient",
        "nGames": n_games,
        "maxDay": MAX_DAY,
        "nearLaunchDays": NEAR_LAUNCH_DAYS,
        "minGames": MIN_GAMES,
        "quantiles": QUANTILES,
        "days": days,
    }


def run(con: Connection, data: AnalyticsData) -> dict:
    daily = daily_by_age(data)
    by_genre = {gid: rows for gid, rows in daily.groupby("genreId", sort=False)}
    empty = daily.iloc[0:0]
    results = [
        {
            "scopeType": "genre",
            "scopeId": gen.id,
            "payload": summarize(by_genre.get(gen.id, empty)),
        }
        for gen in data.genres.itertuples()
    ]
    return write_results(con, KIND, results)


if __name__ == "__main__":
    print(f"launch_benchmark: {run_standalone(run)}")
