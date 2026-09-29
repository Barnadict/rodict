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

from db import AnalyticsData, Connection, run_standalone, write_results

KIND = "forecast"
MIN_POINTS = 5
HORIZON = 5
ALPHA = 0.5
BETA = 0.3
Z = 1.28  # ~80% band
# The step length is read from the spacing of the most recent points, so the
# chart can place the projection on a real time axis (Task #57).
STEP_SAMPLE = 8


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


def _time_anchor(times: pd.Series) -> dict:
    """When the projection starts (the last point it was fitted on) and how long
    one step is: the median spacing of the last few points, so an outage gap
    earlier in the series doesn't stretch the steps."""
    t = times.sort_values()
    if t.empty:
        return {}
    diffs = t.tail(STEP_SAMPLE + 1).diff().dropna().dt.total_seconds()
    diffs = diffs[diffs > 0]
    anchor = {"lastAt": t.iloc[-1].strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"}
    if not diffs.empty:
        anchor["stepHours"] = round(float(diffs.median()) / 3600, 2)
    return anchor


def run(con: Connection, data: AnalyticsData) -> dict:
    gensnaps = data.genre_snapshots
    genres = data.genres

    results = []
    for gen in genres.itertuples():
        gs = gensnaps[gensnaps["genreId"] == gen.id].sort_values("collectedAt")
        payload = _holt(gs["totalPlaying"].to_numpy(dtype=float))
        if payload is None:
            payload = {"status": "insufficient", "method": "holt", "points": []}
        else:
            payload.update(_time_anchor(gs["collectedAt"]))
        results.append({"scopeType": "genre", "scopeId": gen.id, "payload": payload})

    return write_results(con, KIND, results)


if __name__ == "__main__":
    print(f"forecast: {run_standalone(run)}")
