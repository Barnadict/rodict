"""Run all Phase 4 analytics jobs in order and report a summary.

Usage (from repo root):  analytics/.venv/Scripts/python analytics/run.py
Order matters only loosely; each job reads the DB fresh and replaces its own
AnalyticsResult rows. Scheduling this in CI is Task #33.
"""
from __future__ import annotations

import time

import survival
import momentum
import clustering
import opportunity
import anomaly
import correlation
import cohort
import seasonality
import forecast

JOBS = [
    ("survival_km", survival.run),
    ("trend_momentum", momentum.run),
    ("trajectory_cluster", clustering.run),
    ("opportunity_score", opportunity.run),
    ("change_point", anomaly.run),
    ("correlation", correlation.run),
    ("cohort", cohort.run),
    ("seasonality", seasonality.run),
    ("forecast", forecast.run),
]


def main() -> None:
    for name, fn in JOBS:
        start = time.time()
        try:
            n = fn()
            print(f"  {name:20s} wrote {n:3d} results  ({time.time() - start:.1f}s)")
        except Exception as exc:  # keep going; one job failing shouldn't block others
            print(f"  {name:20s} FAILED: {exc}")


if __name__ == "__main__":
    print("Running Phase 4 analytics jobs...")
    main()
    print("Done.")
