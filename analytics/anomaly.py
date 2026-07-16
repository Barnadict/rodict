"""Task #25 — Change-point / anomaly detection.

Auto-flags player spikes and drops (game updates, viral moments, sudden decline)
on each game's player curve and each genre's total-players curve, using a robust
z-score on successive percent changes: an anomaly is a step whose magnitude is
far from the game's own typical step size (median +/- MAD), so it adapts to each
game's natural volatility rather than a global threshold.

Robust (median/MAD) rather than mean/std so a single big jump doesn't hide the
next one. Cold-start: needs a handful of points and non-zero typical variation;
until then most series flag nothing, which is correct.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import connect, load_games, load_game_snapshots, load_genres, load_genre_snapshots, write_results

KIND = "change_point"
MIN_POINTS = 4
Z_THRESHOLD = 3.5
MAD_TO_STD = 1.4826


def _anomalies(times: list, values: np.ndarray) -> list[dict]:
    """Flag steps whose robust z-score of pct-change exceeds the threshold."""
    if len(values) < MIN_POINTS:
        return []
    prev = values[:-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        pct = np.where(prev > 0, (values[1:] - prev) / prev, 0.0)
    med = np.median(pct)
    mad = np.median(np.abs(pct - med))
    if mad <= 1e-9:
        return []  # no typical variation to compare against yet
    z = (pct - med) / (MAD_TO_STD * mad)

    out = []
    for i, zi in enumerate(z):
        if abs(zi) >= Z_THRESHOLD:
            out.append(
                {
                    "at": times[i + 1].isoformat(timespec="milliseconds"),
                    "value": int(values[i + 1]),
                    "prevValue": int(values[i]),
                    "changePct": round(float(pct[i]), 4),
                    "direction": "spike" if pct[i] > 0 else "drop",
                    "score": round(float(abs(zi)), 2),
                }
            )
    return out


def run() -> int:
    con = connect()
    try:
        games = load_games(con)
        gname = dict(zip(games["id"], games["name"]))
        gsnaps = load_game_snapshots(con)
        genres = load_genres(con)
        genre_name = dict(zip(genres["id"], genres["name"]))
        gensnaps = load_genre_snapshots(con)

        results = []
        recent = []  # global feed of the most notable changes

        for gid, gs in gsnaps.groupby("gameId"):
            an = _anomalies(gs["collectedAt"].to_list(), gs["playing"].to_numpy(dtype=float))
            if an:
                results.append({"scopeType": "game", "scopeId": gid,
                                "payload": {"nAnomalies": len(an), "anomalies": an}})
                for a in an:
                    recent.append({"scope": "game", "id": gid, "name": gname.get(gid, ""), **a})

        for genid, gg in gensnaps.groupby("genreId"):
            an = _anomalies(gg["collectedAt"].to_list(), gg["totalPlaying"].to_numpy(dtype=float))
            if an:
                results.append({"scopeType": "genre", "scopeId": genid,
                                "payload": {"nAnomalies": len(an), "anomalies": an}})
                for a in an:
                    recent.append({"scope": "genre", "id": genid, "name": genre_name.get(genid, ""), **a})

        recent.sort(key=lambda a: a["score"], reverse=True)
        results.append({"scopeType": "global", "scopeId": None,
                        "payload": {"recent": recent[:20], "nTotal": len(recent)}})

        return write_results(con, KIND, results)
    finally:
        con.close()


if __name__ == "__main__":
    print(f"change_point: wrote {run()} results")
