"""Task #29 — Forecasting genre trajectories.

Projects each genre's total-players series a few steps ahead using Holt's linear
exponential smoothing, with an uncertainty band from in-sample residuals that
widens with the horizon. Output is ALWAYS labeled a projection with a band —
never presented as certain.

Uses lightweight exponential smoothing (not Prophet) deliberately: it's stable
with few points and needs no daily seasonality data we don't have yet. Prophet
can be swapped in once weeks of daily snapshots accrue. At cold-start the band is
very wide and only the trajectory *direction* is meaningful — the frontend says so.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import connect, load_genres, load_genre_snapshots, write_results

KIND = "forecast"
MIN_POINTS = 5
HORIZON = 5
ALPHA = 0.5
BETA = 0.3
Z = 1.28  # ~80% band


def _holt(y: np.ndarray) -> dict | None:
    n = len(y)
    if n < MIN_POINTS:
        return None
    level = float(y[0])
    trend = float(y[1] - y[0])
    residuals = []
    for t in range(1, n):
        forecast = level + trend
        residuals.append(y[t] - forecast)
        new_level = ALPHA * y[t] + (1 - ALPHA) * (level + trend)
        trend = BETA * (new_level - level) + (1 - BETA) * trend
        level = new_level

    resid_std = float(np.std(residuals)) if residuals else 0.0
    points = []
    for h in range(1, HORIZON + 1):
        fc = level + h * trend
        band = Z * resid_std * np.sqrt(h)
        points.append(
            {
                "step": h,
                "forecast": round(max(0.0, fc), 1),
                "lower": round(max(0.0, fc - band), 1),
                "upper": round(max(0.0, fc + band), 1),
            }
        )

    rel = trend / level if level > 0 else 0.0
    direction = "up" if rel > 0.01 else "down" if rel < -0.01 else "flat"
    return {
        "status": "ok",
        "method": "holt",
        "horizon": HORIZON,
        "lastValue": round(float(y[-1]), 1),
        "trend": direction,
        "points": points,
        "note": "Projection with an ~80% uncertainty band, not a certainty. Short-horizon and wide at cold-start — trajectory direction is the reliable takeaway.",
    }


def run() -> int:
    con = connect()
    try:
        gensnaps = load_genre_snapshots(con)
        genres = load_genres(con)

        results = []
        for gen in genres.itertuples():
            gs = gensnaps[gensnaps["genreId"] == gen.id].sort_values("collectedAt")
            payload = _holt(gs["totalPlaying"].to_numpy(dtype=float))
            if payload is None:
                payload = {"status": "insufficient", "method": "holt", "points": []}
            results.append({"scopeType": "genre", "scopeId": gen.id, "payload": payload})

        return write_results(con, KIND, results)
    finally:
        con.close()


if __name__ == "__main__":
    print(f"forecast: wrote {run()} results")
