"""Task #85 — Keep Game.status / Game.deadSince in step with the dead rule.

The dead rule (deadrule.py) was only ever evaluated inside survival analysis,
so every game stayed "active" in the Game table: the Dead badges, the /games
status filter and the graveyard had nothing to show. This job judges each game
at its latest reading (`current_death`) and writes ONLY the games whose status
or deadSince changed. After the first run that's a few transitions a day; the
first run itself writes one row per game that is dead now (a one-off backfill).

Updates go out as chunked `UPDATE ... SET col = CASE id WHEN ? THEN ? ... END
WHERE id IN (...)` statements, never one statement per game: against Turso the
driver sends each statement as its own round trip.
"""
from __future__ import annotations

import pandas as pd

from db import AnalyticsData, Connection, iso_prisma, run_standalone
from deadrule import current_death

UPDATE_CHUNK = 100  # 5 params per game: 2 per CASE x 2 + the IN list = 500 < 999


def desired_statuses(data: AnalyticsData) -> dict[str, tuple[str, str | None]]:
    """gameId -> (status, deadSince as Prisma's text format or None) for every game."""
    by_game = data.snaps_by_game()
    out: dict[str, tuple[str, str | None]] = {}
    for g in data.games.itertuples():
        snaps = by_game.get(g.id)
        death = current_death(snaps, int(g.allTimePeakPlayers or 0)) if snaps is not None else None
        out[g.id] = ("dead", iso_prisma(death)) if death is not None else ("active", None)
    return out


def changed_rows(data: AnalyticsData) -> list[tuple[str, str, str | None]]:
    """(gameId, status, deadSince) for games whose stored values differ."""
    stored = {
        g.id: (g.status, None if pd.isna(g.deadSince) else iso_prisma(g.deadSince))
        for g in data.games.itertuples()
    }
    return [
        (gid, status, dead_since)
        for gid, (status, dead_since) in desired_statuses(data).items()
        if stored.get(gid) != (status, dead_since)
    ]


def run(con: Connection, data: AnalyticsData) -> dict:
    rows = changed_rows(data)
    cur = con.cursor()
    for i in range(0, len(rows), UPDATE_CHUNK):
        group = rows[i : i + UPDATE_CHUNK]
        whens = " ".join(["WHEN ? THEN ?"] * len(group))
        params = [v for gid, status, _ in group for v in (gid, status)]
        params += [v for gid, _, dead_since in group for v in (gid, dead_since)]
        params += [gid for gid, _, _ in group]
        cur.execute(
            f"""UPDATE "Game"
                SET status = CASE id {whens} END,
                    deadSince = CASE id {whens} END
                WHERE id IN ({", ".join("?" * len(group))})""",
            params,
        )
    con.commit()
    return {
        "table": "Game",
        "inserted": 0,
        "updated": len(rows),
        "deleted": 0,
        "unchanged": len(data.games) - len(rows),
    }


if __name__ == "__main__":
    print(f"game_status: {run_standalone(run)}")
