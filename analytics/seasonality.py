"""Task #28 — Seasonality detection.

Detects day-of-week (and hour-of-day) patterns in genre popularity: are players
more active on weekends, or at particular hours? For each genre's total-players
series we average by weekday/hour and index it against the overall mean (1.0 =
average; 1.2 = 20% above).

Needs the series to span enough distinct days/hours to be meaningful. At
cold-start (well under a day of history) every genre resolves to
status="insufficient" — correct, not a failure; this fills in over weeks.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from db import connect, load_genres, load_genre_snapshots, write_results

KIND = "seasonality"
MIN_DISTINCT_DAYS = 7
MIN_DISTINCT_HOURS = 12
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _index_by(series: pd.DataFrame, key_col: str) -> list[dict]:
    overall = series["totalPlaying"].mean()
    if overall <= 0:
        return []
    grouped = series.groupby(key_col)["totalPlaying"].mean()
    return [
        {"key": int(k), "index": round(float(v / overall), 3), "avgPlaying": round(float(v), 1)}
        for k, v in grouped.items()
    ]


def _analyze(series: pd.DataFrame) -> dict:
    t = series["collectedAt"]
    distinct_days = t.dt.floor("D").nunique()
    distinct_hours = t.dt.hour.nunique()
    if distinct_days < MIN_DISTINCT_DAYS:
        return {"status": "insufficient", "distinctDays": int(distinct_days),
                "needDays": MIN_DISTINCT_DAYS, "byWeekday": [], "byHour": []}

    s = series.copy()
    s["weekday"] = s["collectedAt"].dt.weekday
    s["hour"] = s["collectedAt"].dt.hour
    overall = s["totalPlaying"].mean()

    wk = s.groupby("weekday")["totalPlaying"].mean()
    by_weekday = [
        {"label": WEEKDAYS[int(k)], "index": round(float(v / overall), 3)} for k, v in wk.items()
    ]
    by_hour = _index_by(s.rename(columns={"hour": "k"}), "k") if distinct_hours >= MIN_DISTINCT_HOURS else []
    return {"status": "ok", "distinctDays": int(distinct_days), "byWeekday": by_weekday, "byHour": by_hour}


def run() -> int:
    con = connect()
    try:
        gensnaps = load_genre_snapshots(con)
        genres = load_genres(con)

        results = []
        for gen in genres.itertuples():
            gs = gensnaps[gensnaps["genreId"] == gen.id]
            if gs.empty:
                continue
            results.append({"scopeType": "genre", "scopeId": gen.id, "payload": _analyze(gs)})

        # global: total players across all genres per timestamp
        if not gensnaps.empty:
            glob = gensnaps.groupby("collectedAt", as_index=False)["totalPlaying"].sum()
            results.append({"scopeType": "global", "scopeId": None, "payload": _analyze(glob)})

        return write_results(con, KIND, results)
    finally:
        con.close()


if __name__ == "__main__":
    print(f"seasonality: wrote {run()} results")
