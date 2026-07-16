"""Task #23 — Trajectory clustering.

Groups games by the SHAPE of their player curve (fast-spike-fast-fade vs
slow-burn-long-tail vs steady vs volatile) using k-means on scale-free shape
features, then surfaces which archetype a genre tends toward.

Features are computed over snapshot index (not wall-clock time) and normalized
per game, so they're comparable across games and don't explode when the
observation span is tiny. Needs a minimum of games/points; otherwise returns
status="insufficient".
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from db import connect, load_games, load_game_snapshots, load_genres, write_results

KIND = "trajectory_cluster"
MIN_POINTS = 3
MIN_GAMES = 8


def _features(playing: np.ndarray) -> dict:
    peak = playing.max()
    if peak <= 0:
        return {}
    norm = playing / peak
    n = len(playing)
    slope = float(np.polyfit(np.arange(n), norm, 1)[0])  # per-snapshot trend
    mean = float(playing.mean())
    cv = float(playing.std() / mean) if mean > 0 else 0.0
    return {
        "slopeNorm": slope,
        "cv": cv,
        "peakPos": float(playing.argmax() / (n - 1)) if n > 1 else 0.0,
        "lastVsMax": float(playing[-1] / peak),
        "meanNorm": float(norm.mean()),
    }


def _label(centroid: dict) -> str:
    if centroid["slopeNorm"] > 0.03:
        return "Rising"
    if centroid["lastVsMax"] < 0.6:
        return "Fading"
    if centroid["cv"] > 0.25:
        return "Volatile"
    return "Steady"


def _insufficient(n_games: int) -> list:
    return [{"scopeType": "global", "scopeId": None,
             "payload": {"status": "insufficient", "nGames": n_games, "archetypes": []}}]


def run() -> int:
    con = connect()
    try:
        games = load_games(con)
        snaps = load_game_snapshots(con)
        ggenre = dict(zip(games["id"], games["currentGenreId"]))

        feats, ids = [], []
        for gid, gs in snaps.groupby("gameId"):
            if len(gs) < MIN_POINTS:
                continue
            f = _features(gs["playing"].to_numpy(dtype=float))
            if f:
                feats.append(f)
                ids.append(gid)

        if len(ids) < MIN_GAMES:
            return write_results(con, KIND, _insufficient(len(ids)))

        cols = ["slopeNorm", "cv", "peakPos", "lastVsMax", "meanNorm"]
        X = np.array([[f[c] for c in cols] for f in feats])
        Xs = StandardScaler().fit_transform(X)
        k = min(4, len(ids))
        km = KMeans(n_clusters=k, n_init=10, random_state=42).fit(Xs)

        # label each cluster from its mean (original-space) centroid
        labels = {}
        for c in range(k):
            members = X[km.labels_ == c]
            centroid = {col: float(members[:, i].mean()) for i, col in enumerate(cols)}
            labels[c] = _label(centroid)

        results = []
        per_game_archetype = {}
        for gid, f, cl in zip(ids, feats, km.labels_):
            archetype = labels[int(cl)]
            per_game_archetype[gid] = archetype
            results.append(
                {"scopeType": "game", "scopeId": gid,
                 "payload": {"archetype": archetype, "features": {c: round(f[c], 4) for c in cols}}}
            )

        # per-genre archetype distribution
        genres = load_genres(con)
        for gen in genres.itertuples():
            counts: dict[str, int] = {}
            for gid, arch in per_game_archetype.items():
                if ggenre.get(gid) == gen.id:
                    counts[arch] = counts.get(arch, 0) + 1
            if counts:
                results.append(
                    {"scopeType": "genre", "scopeId": gen.id,
                     "payload": {"nGames": sum(counts.values()), "archetypeCounts": counts}}
                )

        # global summary
        global_counts: dict[str, int] = {}
        for arch in per_game_archetype.values():
            global_counts[arch] = global_counts.get(arch, 0) + 1
        results.append(
            {"scopeType": "global", "scopeId": None,
             "payload": {"status": "ok", "nGames": len(ids), "archetypeCounts": global_counts}}
        )

        return write_results(con, KIND, results)
    finally:
        con.close()


if __name__ == "__main__":
    print(f"trajectory_cluster: wrote {run()} results")
