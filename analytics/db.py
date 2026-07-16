"""Shared DB access for the Phase 4 analytics jobs.

Reads the same DB the collector writes (local SQLite by default) and writes
precomputed results into the AnalyticsResult table, which the Next.js frontend
then reads read-only. Timestamps are written in the exact ISO-8601 + '+00:00'
millisecond format Prisma uses for SQLite DateTime, so Prisma parses them back.
"""
from __future__ import annotations

import os
import json
import uuid
import sqlite3
from datetime import datetime, timezone

import pandas as pd


def db_path() -> str:
    """Local SQLite path from DATABASE_URL (file:...) or the dev.db default."""
    url = os.environ.get("DATABASE_URL", "file:./dev.db")
    if url.startswith("file:"):
        return url[len("file:") :]
    # Hosted Turso/Postgres wiring is Task #33; local dev is SQLite.
    return "dev.db"


def connect() -> sqlite3.Connection:
    return sqlite3.connect(db_path())


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


# --- loaders (as DataFrames) -------------------------------------------------


def load_games(con: sqlite3.Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        """SELECT id, universeId, name, currentGenreId, allTimePeakPlayers,
                  currentPlaying, currentVisits, currentFavorites,
                  currentUpVotes, currentDownVotes,
                  robloxCreatedAt, firstSeenAt, status
           FROM Game""",
        con,
    )
    for col in ("robloxCreatedAt", "firstSeenAt"):
        df[col] = pd.to_datetime(df[col], utc=True, errors="coerce")
    return df


def load_game_snapshots(con: sqlite3.Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        "SELECT gameId, collectedAt, playing, visits FROM GameSnapshot",
        con,
    )
    df["collectedAt"] = pd.to_datetime(df["collectedAt"], utc=True, errors="coerce")
    return df.sort_values("collectedAt")


def load_genres(con: sqlite3.Connection) -> pd.DataFrame:
    return pd.read_sql_query("SELECT id, slug, name FROM Genre WHERE isActive = 1", con)


def load_genre_snapshots(con: sqlite3.Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        "SELECT genreId, collectedAt, totalPlaying, totalGames FROM GenreSnapshot",
        con,
    )
    df["collectedAt"] = pd.to_datetime(df["collectedAt"], utc=True, errors="coerce")
    return df.sort_values("collectedAt")


# --- writing results ---------------------------------------------------------


def write_results(con: sqlite3.Connection, kind: str, rows: list[dict]) -> int:
    """Replace all AnalyticsResult rows of `kind` with a fresh batch.

    Each row: {scopeType, scopeId?, payload(dict), periodStart?, periodEnd?, version?}.
    Delete-then-insert keeps only the latest run's results per kind (idempotent).
    """
    now = iso_now()
    cur = con.cursor()
    cur.execute('DELETE FROM "AnalyticsResult" WHERE kind = ?', (kind,))
    records = [
        (
            uuid.uuid4().hex,
            kind,
            r["scopeType"],
            r.get("scopeId"),
            r.get("periodStart"),
            r.get("periodEnd"),
            now,
            r.get("version", "1"),
            json.dumps(r["payload"], separators=(",", ":")),
        )
        for r in rows
    ]
    cur.executemany(
        """INSERT INTO "AnalyticsResult"
           (id, kind, scopeType, scopeId, periodStart, periodEnd, computedAt, version, payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        records,
    )
    con.commit()
    return len(records)
