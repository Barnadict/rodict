"""Task #22 — Trend & momentum metrics.

Per genre: the mean 7-day growth of its games and a top-movers list, which feed
a more robust Rising board than raw endpoint growth alone.

Momentum is anchored on the window GROWTH RATIO (scale-free, bounded) rather
than raw slope, which explodes when the observation span is tiny (cold-start).

Only genre rows are written. This job used to also store one row per game
(moving average, slope, 7d/30d growth) — ~5.3K rows deleted and re-inserted
every run — but no page ever read them, so they were pure write-budget cost
(Task #43). For the same reason it only needs the last WINDOW_DAYS of
snapshots, sliced from the shared load (Task #44).
"""
from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd

from db import AnalyticsData, Connection, run_standalone, write_results

KIND = "trend_momentum"
WINDOW_DAYS = 7


def _window_growth(snaps: pd.DataFrame, now: pd.Timestamp, days: int) -> float | None:
    cutoff = now - timedelta(days=days)
    w = snaps[snaps["collectedAt"] >= cutoff]
    if len(w) < 2:
        return None
    base = w["playing"].iloc[0]
    cur = w["playing"].iloc[-1]
    return None if base <= 0 else round((cur - base) / base, 4)


def run(con: Connection, data: AnalyticsData) -> dict:
    recent = data.recent_game_snapshots(WINDOW_DAYS)
    if recent.empty:
        return write_results(con, KIND, [])
    now = data.now
    games = data.games
    gname = dict(zip(games["id"], games["name"]))
    ggenre = dict(zip(games["id"], games["currentGenreId"]))

    # growth over the window for every game with a trend in it (>= 2 points)
    growth: dict[str, float | None] = {}
    for gid, gs in recent.groupby("gameId", sort=False):
        if len(gs) >= 2:
            growth[gid] = _window_growth(gs, now, WINDOW_DAYS)

    # per-genre: mean of member games' 7d growth + a top-movers list
    results = []
    for gen in data.genres.itertuples():
        members = [
            {"gameId": gid, "name": gname.get(gid, ""), "growth7d": g7}
            for gid, g7 in growth.items()
            if ggenre.get(gid) == gen.id
        ]
        if not members:
            continue
        with_growth = [x for x in members if x["growth7d"] is not None]
        top = sorted(with_growth, key=lambda x: x["growth7d"], reverse=True)[:5]
        results.append(
            {
                "scopeType": "genre",
                "scopeId": gen.id,
                "payload": {
                    "nGames": len(members),
                    "avgGrowth7d": (
                        round(float(np.mean([x["growth7d"] for x in with_growth])), 4)
                        if with_growth
                        else None
                    ),
                    "topMovers": top,
                },
            }
        )

    return write_results(con, KIND, results)


if __name__ == "__main__":
    print(f"trend_momentum: {run_standalone(run)}")
