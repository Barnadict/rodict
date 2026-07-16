"""Task #24 — Opportunity / saturation score per genre.

A composite demand-vs-supply index that ranks genres by how under-served they
look: high demand concentrated across few games, ideally with positive momentum
and low crowding. Upgrades the basic /saturation view (Task #18).

It is a DESCRIPTIVE signal, deliberately transparent and tunable — never advice.
All component weights live in WEIGHTS. Unlike survival/clustering it works at
cold-start, since it reads current aggregates (+ short-window genre growth).
"""
from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd

from db import connect, load_games, load_genres, load_genre_snapshots, write_results

KIND = "opportunity_score"

WEIGHTS = {
    "intensity": 0.40,  # players per game (demand each game captures)
    "demand": 0.25,  # total players (raw genre demand)
    "growth": 0.20,  # short-term genre momentum
    "supply": -0.15,  # number of games (crowding — penalized)
}


def _minmax(series: pd.Series) -> pd.Series:
    lo, hi = series.min(), series.max()
    if hi - lo < 1e-9:
        return pd.Series(0.5, index=series.index)
    return (series - lo) / (hi - lo)


def _genre_growth7d(gsnaps: pd.DataFrame) -> dict:
    if gsnaps.empty:
        return {}
    now = gsnaps["collectedAt"].max()
    cutoff = now - timedelta(days=7)
    out = {}
    for gid, df in gsnaps.groupby("genreId"):
        w = df[df["collectedAt"] >= cutoff]
        if len(w) < 2:
            continue
        base = w["totalPlaying"].iloc[0]
        cur = w["totalPlaying"].iloc[-1]
        if base > 0:
            out[gid] = (cur - base) / base
    return out


def run() -> int:
    con = connect()
    try:
        games = load_games(con)
        genres = load_genres(con)
        gsnaps = load_genre_snapshots(con)
        growth = _genre_growth7d(gsnaps)

        classified = games[games["currentGenreId"].notna()]
        agg = (
            classified.groupby("currentGenreId")
            .agg(totalPlaying=("currentPlaying", "sum"), gameCount=("id", "count"))
            .reset_index()
        )
        agg = agg[agg["gameCount"] > 0]
        if agg.empty:
            return write_results(con, KIND, [])

        agg["playersPerGame"] = agg["totalPlaying"] / agg["gameCount"]
        agg["growth7d"] = agg["currentGenreId"].map(growth).fillna(0.0)

        agg["intensity_n"] = _minmax(agg["playersPerGame"])
        agg["demand_n"] = _minmax(agg["totalPlaying"])
        agg["growth_n"] = _minmax(agg["growth7d"])
        agg["supply_n"] = _minmax(agg["gameCount"])

        raw = (
            WEIGHTS["intensity"] * agg["intensity_n"]
            + WEIGHTS["demand"] * agg["demand_n"]
            + WEIGHTS["growth"] * agg["growth_n"]
            + WEIGHTS["supply"] * agg["supply_n"]
        )
        agg["score"] = (_minmax(raw) * 100).round(1)
        agg = agg.sort_values("score", ascending=False).reset_index(drop=True)

        gname = dict(zip(genres["id"], genres["name"]))
        gslug = dict(zip(genres["id"], genres["slug"]))

        results = []
        ranking = []
        for rank, row in enumerate(agg.itertuples(), start=1):
            gid = row.currentGenreId
            payload = {
                "score": float(row.score),
                "rank": rank,
                "components": {
                    "totalPlaying": int(row.totalPlaying),
                    "gameCount": int(row.gameCount),
                    "playersPerGame": round(float(row.playersPerGame), 1),
                    "growth7d": round(float(row.growth7d), 4),
                },
            }
            results.append({"scopeType": "genre", "scopeId": gid, "payload": payload})
            ranking.append(
                {"genreId": gid, "slug": gslug.get(gid), "name": gname.get(gid),
                 "score": float(row.score), "rank": rank}
            )

        results.append({"scopeType": "global", "scopeId": None,
                        "payload": {"weights": WEIGHTS, "ranking": ranking}})
        return write_results(con, KIND, results)
    finally:
        con.close()


if __name__ == "__main__":
    print(f"opportunity_score: wrote {run()} results")
