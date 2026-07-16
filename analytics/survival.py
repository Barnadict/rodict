"""Task #21 — Survival analysis (Kaplan-Meier) of genre lifespan.

For each genre we estimate how long its games survive before dying (the "dead"
rule), answering "median lifespan of a {genre} game is X weeks". Games still
alive are right-censored; because we only start observing a game at firstSeenAt
(not its launch), each game enters the risk set at its age then (left
truncation) — otherwise KM would be biased.

Cold-start: with no deaths observed yet, every genre resolves to
status="insufficient_deaths" (median undefined, survival stays at 1.0). This is
correct, not a failure — real curves appear as games are followed to death.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from lifelines import KaplanMeierFitter

from db import connect, load_games, load_game_snapshots, load_genres, write_results
from deadrule import detect_death

WEEK_SECONDS = 7 * 86400
KIND = "survival_km"
EPS_WEEKS = 1e-4  # keep entry strictly below duration for lifelines


def _build_lifetimes(games: pd.DataFrame, snaps_by_game: dict) -> pd.DataFrame:
    """One row per game: entry/duration (weeks since launch) + observed flag."""
    rows = []
    for g in games.itertuples():
        if pd.isna(g.robloxCreatedAt) or pd.isna(g.firstSeenAt):
            continue
        snaps = snaps_by_game.get(g.id)
        if snaps is None or snaps.empty:
            continue

        death = detect_death(snaps, int(g.allTimePeakPlayers or 0))
        last_obs = snaps["collectedAt"].max()
        end = death if death is not None else last_obs

        duration = (end - g.robloxCreatedAt).total_seconds() / WEEK_SECONDS
        entry = (g.firstSeenAt - g.robloxCreatedAt).total_seconds() / WEEK_SECONDS
        if duration <= 0:
            continue
        entry = max(0.0, min(entry, duration - EPS_WEEKS))
        rows.append(
            {
                "duration": duration,
                "entry": entry,
                "observed": 1 if death is not None else 0,
            }
        )
    return pd.DataFrame(rows)


def _fit(lifetimes: pd.DataFrame) -> dict:
    n_games = len(lifetimes)
    n_deaths = int(lifetimes["observed"].sum()) if n_games else 0

    if n_games < 3:
        return {"status": "insufficient_games", "nGames": n_games, "nDeaths": n_deaths,
                "medianLifespanWeeks": None, "curve": []}

    # No deaths observed yet: the KM curve is trivially flat at 1.0 and the median
    # is undefined. Skip the fit — a left-truncated KM with zero events over a
    # near-zero window is numerically degenerate (this is the cold-start norm).
    if n_deaths == 0:
        return {"status": "insufficient_deaths", "nGames": n_games, "nDeaths": 0,
                "medianLifespanWeeks": None,
                "curve": [{"week": 0.0, "survival": 1.0}]}

    kmf = KaplanMeierFitter()
    try:
        kmf.fit(
            lifetimes["duration"],
            event_observed=lifetimes["observed"],
            entry=lifetimes["entry"],
        )
    except Exception:
        # Degenerate truncation structure — report counts without a curve.
        return {"status": "insufficient_deaths", "nGames": n_games, "nDeaths": n_deaths,
                "medianLifespanWeeks": None, "curve": []}

    median = kmf.median_survival_time_
    median_out = None if (median is None or np.isinf(median) or np.isnan(median)) else round(float(median), 2)

    sf = kmf.survival_function_
    # sample up to 40 points of the step function
    idx = np.linspace(0, len(sf) - 1, min(40, len(sf))).astype(int)
    curve = [
        {"week": round(float(sf.index[i]), 2), "survival": round(float(sf.iloc[i, 0]), 4)}
        for i in idx
    ]

    return {
        "status": "ok" if n_deaths > 0 else "insufficient_deaths",
        "nGames": n_games,
        "nDeaths": n_deaths,
        "medianLifespanWeeks": median_out,
        "curve": curve,
    }


def run() -> int:
    con = connect()
    try:
        games = load_games(con)
        snaps = load_game_snapshots(con)
        genres = load_genres(con)
        snaps_by_game = {gid: df for gid, df in snaps.groupby("gameId")}

        results = []
        # per genre
        for gen in genres.itertuples():
            gg = games[games["currentGenreId"] == gen.id]
            payload = _fit(_build_lifetimes(gg, snaps_by_game))
            results.append({"scopeType": "genre", "scopeId": gen.id, "payload": payload})

        # global (all classified games)
        classified = games[games["currentGenreId"].notna()]
        results.append(
            {"scopeType": "global", "scopeId": None, "payload": _fit(_build_lifetimes(classified, snaps_by_game))}
        )

        return write_results(con, KIND, results)
    finally:
        con.close()


if __name__ == "__main__":
    print(f"survival_km: wrote {run()} results")
