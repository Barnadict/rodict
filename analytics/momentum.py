"""Task #22 — Trend & momentum metrics.

Formalizes, per game (and aggregated per genre), the signals that separate a
real climb from sampling noise: window growth rate, a trailing moving average,
and the slope of the player curve (least-squares trend). These feed a more
robust Rising board than raw endpoint growth alone.

Momentum is anchored on the window GROWTH RATIO (scale-free, bounded) rather
than raw slope, which explodes when the observation span is tiny (cold-start).
Slope is stored as a supplementary signal.
"""
from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd

from db import connect, load_games, load_game_snapshots, load_genres, write_results

KIND = "trend_momentum"
MA_WINDOW = 5


def _window_growth(snaps: pd.DataFrame, now: pd.Timestamp, days: int) -> float | None:
    cutoff = now - timedelta(days=days)
    w = snaps[snaps["collectedAt"] >= cutoff]
    if len(w) < 2:
        return None
    base = w["playing"].iloc[0]
    cur = w["playing"].iloc[-1]
    return None if base <= 0 else round((cur - base) / base, 4)


def _slope_per_day(snaps: pd.DataFrame) -> float | None:
    if len(snaps) < 2:
        return None
    t0 = snaps["collectedAt"].iloc[0]
    days = (snaps["collectedAt"] - t0).dt.total_seconds().to_numpy() / 86400
    if days[-1] - days[0] <= 0:
        return None
    slope = float(np.polyfit(days, snaps["playing"].to_numpy(dtype=float), 1)[0])
    return round(slope, 2)


def _game_momentum(snaps: pd.DataFrame, now: pd.Timestamp) -> dict:
    playing = snaps["playing"].to_numpy(dtype=float)
    ma = float(pd.Series(playing).rolling(MA_WINDOW, min_periods=1).mean().iloc[-1])
    return {
        "snapshotCount": int(len(snaps)),
        "latestPlaying": int(playing[-1]),
        "movingAvg": round(ma, 1),
        "slopePerDay": _slope_per_day(snaps),
        "growth7d": _window_growth(snaps, now, 7),
        "growth30d": _window_growth(snaps, now, 30),
    }


def run() -> int:
    con = connect()
    try:
        games = load_games(con)
        snaps = load_game_snapshots(con)
        if snaps.empty:
            return write_results(con, KIND, [])
        now = snaps["collectedAt"].max()
        snaps_by_game = {gid: df for gid, df in snaps.groupby("gameId")}
        gname = dict(zip(games["id"], games["name"]))
        ggenre = dict(zip(games["id"], games["currentGenreId"]))

        results = []
        per_game = {}
        for gid, gs in snaps_by_game.items():
            if len(gs) < 2:
                continue
            m = _game_momentum(gs, now)
            per_game[gid] = m
            results.append({"scopeType": "game", "scopeId": gid, "payload": m})

        # per-genre: mean of member games' 7d growth + a top-movers list
        genres = load_genres(con)
        for gen in genres.itertuples():
            members = [
                {"gameId": gid, "name": gname.get(gid, ""), **m}
                for gid, m in per_game.items()
                if ggenre.get(gid) == gen.id
            ]
            if not members:
                continue
            g7 = [x["growth7d"] for x in members if x["growth7d"] is not None]
            top = sorted(
                [x for x in members if x["growth7d"] is not None],
                key=lambda x: x["growth7d"],
                reverse=True,
            )[:5]
            results.append(
                {
                    "scopeType": "genre",
                    "scopeId": gen.id,
                    "payload": {
                        "nGames": len(members),
                        "avgGrowth7d": round(float(np.mean(g7)), 4) if g7 else None,
                        "topMovers": [
                            {"gameId": x["gameId"], "name": x["name"], "growth7d": x["growth7d"]}
                            for x in top
                        ],
                    },
                }
            )

        return write_results(con, KIND, results)
    finally:
        con.close()


if __name__ == "__main__":
    print(f"trend_momentum: wrote {run()} results")
