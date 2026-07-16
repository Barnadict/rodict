"""Task #26 — Correlation & feature importance.

Answers "which stats are associated with games having more players?" — reported
as DESCRIPTIVE / ASSOCIATIONAL, never causal. Combines rank correlation
(Spearman, robust to the heavy-tailed distributions here) with tree-based
importance (RandomForest), which captures non-linear/interaction structure that
a plain correlation misses.

Guardrails against fooling ourselves:
  - target is current player count; "sustained over time" needs more history, so
    it's labeled as a current-snapshot proxy for now.
  - all-time peak and anything derived from `playing` are EXCLUDED as predictors
    (they'd leak the target). Predictors are independent signals: visits,
    favorites, like ratio, age, total votes.
  - small n is reported so the frontend can caveat it.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from db import connect, load_games, load_game_snapshots, write_results

KIND = "correlation"
WEEK_SECONDS = 7 * 86400
MIN_GAMES = 10

PREDICTORS = ["visits", "favorites", "likeRatio", "ageWeeks", "votesTotal"]
LABELS = {
    "visits": "Total visits",
    "favorites": "Favorites",
    "likeRatio": "Like ratio",
    "ageWeeks": "Age (weeks)",
    "votesTotal": "Total votes",
}
TARGET = "currentPlaying"


def run() -> int:
    con = connect()
    try:
        games = load_games(con)
        snaps = load_game_snapshots(con)
        now = snaps["collectedAt"].max() if not snaps.empty else pd.Timestamp.utcnow()

        df = games.copy()
        df["votesTotal"] = df["currentUpVotes"] + df["currentDownVotes"]
        df["likeRatio"] = np.where(df["votesTotal"] > 0, df["currentUpVotes"] / df["votesTotal"], np.nan)
        df["ageWeeks"] = (now - df["robloxCreatedAt"]).dt.total_seconds() / WEEK_SECONDS
        df["visits"] = df["currentVisits"].astype(float)
        df["favorites"] = df["currentFavorites"].astype(float)

        data = df[[*PREDICTORS, TARGET]].dropna()
        n = len(data)
        if n < MIN_GAMES:
            payload = {"status": "insufficient", "n": n,
                       "target": "currentPlaying", "correlations": [], "importances": []}
            return write_results(con, KIND, [{"scopeType": "global", "scopeId": None, "payload": payload}])

        # Spearman rank correlation (robust to heavy tails), predictor vs target
        corr = data.corr(method="spearman")[TARGET]
        pearson = data.corr(method="pearson")[TARGET]
        correlations = [
            {
                "feature": f,
                "label": LABELS[f],
                "spearman": round(float(corr[f]), 3),
                "pearson": round(float(pearson[f]), 3),
            }
            for f in PREDICTORS
        ]
        correlations.sort(key=lambda c: abs(c["spearman"]), reverse=True)

        # Tree-based importance (captures non-linearities/interactions)
        rf = RandomForestRegressor(n_estimators=300, random_state=42)
        rf.fit(data[PREDICTORS], data[TARGET])
        importances = sorted(
            [{"feature": f, "label": LABELS[f], "importance": round(float(imp), 3)}
             for f, imp in zip(PREDICTORS, rf.feature_importances_)],
            key=lambda x: x["importance"],
            reverse=True,
        )

        payload = {
            "status": "ok",
            "n": n,
            "target": "currentPlaying",
            "targetLabel": "current player count",
            "note": "Associational, not causal. Current-snapshot proxy for 'sustained players' until more history accrues.",
            "correlations": correlations,
            "importances": importances,
        }
        return write_results(con, KIND, [{"scopeType": "global", "scopeId": None, "payload": payload}])
    finally:
        con.close()


if __name__ == "__main__":
    print(f"correlation: wrote {run()} results")
