"""Task #27 — Cohort analysis.

Groups games by launch window (the quarter of robloxCreatedAt) and compares how
cohorts are doing, per genre and globally. Because cohorts of different ages are
compared at the same instant, an older cohort's lower average players is a
cross-sectional retention/decline signal (games launched longer ago have, on
average, fallen further from their peak).

Works at cold-start: it reads launch dates + current metrics, not long time
series. It sharpens into true per-cohort *retention curves* once we have weeks
of snapshots (Phase 4 continues).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import connect, load_games, load_game_snapshots, load_genres, write_results

KIND = "cohort"
WEEK_SECONDS = 7 * 86400


def _cohort_key(dt: pd.Timestamp) -> str:
    return f"{dt.year}-Q{(dt.month - 1) // 3 + 1}"


def _summarize(df: pd.DataFrame) -> dict:
    playing = df["currentPlaying"].to_numpy(dtype=float)
    return {
        "nGames": int(len(df)),
        "avgPlaying": round(float(playing.mean()), 1),
        "medianPlaying": round(float(np.median(playing)), 1),
        "avgAgeWeeks": round(float(df["ageWeeks"].mean()), 1),
        "deadCount": int((df["status"] == "dead").sum()),
    }


def _cohorts(df: pd.DataFrame) -> list[dict]:
    out = []
    for key, grp in df.groupby("cohort"):
        out.append({"cohort": key, **_summarize(grp)})
    # newest launch window first
    out.sort(key=lambda c: c["cohort"], reverse=True)
    return out


def run() -> int:
    con = connect()
    try:
        games = load_games(con)
        snaps = load_game_snapshots(con)
        now = snaps["collectedAt"].max() if not snaps.empty else pd.Timestamp.utcnow()

        df = games[games["robloxCreatedAt"].notna()].copy()
        df["ageWeeks"] = (now - df["robloxCreatedAt"]).dt.total_seconds() / WEEK_SECONDS
        df["cohort"] = df["robloxCreatedAt"].map(_cohort_key)

        results = []
        classified = df[df["currentGenreId"].notna()]
        results.append(
            {"scopeType": "global", "scopeId": None,
             "payload": {"cohorts": _cohorts(classified), "nGames": int(len(classified))}}
        )

        genres = load_genres(con)
        for gen in genres.itertuples():
            gg = df[df["currentGenreId"] == gen.id]
            if len(gg) == 0:
                continue
            results.append(
                {"scopeType": "genre", "scopeId": gen.id,
                 "payload": {"cohorts": _cohorts(gg), "nGames": int(len(gg))}}
            )

        return write_results(con, KIND, results)
    finally:
        con.close()


if __name__ == "__main__":
    print(f"cohort: wrote {run()} results")
