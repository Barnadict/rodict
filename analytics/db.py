"""Shared DB access for the Phase 4 analytics jobs.

Reads the same DB the collector writes and writes precomputed results into the
AnalyticsResult table, which the Next.js frontend then reads read-only.
Timestamps are written in the exact ISO-8601 + '+00:00' millisecond format
Prisma uses for SQLite DateTime, so Prisma parses them back.

Two targets, one code path (Task #33): a local SQLite file (`file:./dev.db`,
via stdlib sqlite3) or the hosted Turso DB (`libsql://...`, via the `libsql`
driver, which exposes the same DB-API surface). Only DATABASE_URL /
DATABASE_AUTH_TOKEN change.
"""
from __future__ import annotations

import os
import json
import uuid
import sqlite3
import warnings
from datetime import datetime, timezone
from typing import Any

import pandas as pd

# A connection is either stdlib sqlite3's or libsql's; both satisfy the small
# DB-API subset used here (cursor/execute/executemany/commit/close).
Connection = Any


def database_url() -> str:
    return os.environ.get("DATABASE_URL", "file:./dev.db")


def is_remote(url: str | None = None) -> bool:
    """True when pointed at hosted Turso rather than a local SQLite file."""
    return (url if url is not None else database_url()).startswith("libsql://")


def db_path() -> str:
    """Local SQLite path from DATABASE_URL (file:...) or the dev.db default."""
    url = database_url()
    if url.startswith("file:"):
        return url[len("file:") :]
    return "dev.db"


def connect() -> Connection:
    """Connect to the local SQLite file, or to hosted Turso if DATABASE_URL is libsql://."""
    url = database_url()
    if not is_remote(url):
        return sqlite3.connect(db_path())

    import libsql  # imported lazily so local-only runs don't need the dependency

    token = os.environ.get("DATABASE_AUTH_TOKEN")
    if not token:
        raise RuntimeError("DATABASE_AUTH_TOKEN is required when DATABASE_URL is a libsql:// URL")
    con = libsql.connect(url, auth_token=token)

    # pandas warns on any DB-API connection that isn't stdlib sqlite3. The libsql
    # driver is a drop-in for the read paths used here (verified against the
    # hosted DB), so silence the warning rather than pulling in SQLAlchemy.
    warnings.filterwarnings(
        "ignore",
        message="pandas only supports SQLAlchemy connectable",
        category=UserWarning,
    )
    return con


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


# --- loaders (as DataFrames) -------------------------------------------------


def load_games(con: Connection) -> pd.DataFrame:
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


def load_game_snapshots(con: Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        "SELECT gameId, collectedAt, playing, visits FROM GameSnapshot",
        con,
    )
    df["collectedAt"] = pd.to_datetime(df["collectedAt"], utc=True, errors="coerce")
    return df.sort_values("collectedAt")


def load_genres(con: Connection) -> pd.DataFrame:
    return pd.read_sql_query("SELECT id, slug, name FROM Genre WHERE isActive = 1", con)


def load_genre_snapshots(con: Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        "SELECT genreId, collectedAt, totalPlaying, totalGames FROM GenreSnapshot",
        con,
    )
    df["collectedAt"] = pd.to_datetime(df["collectedAt"], utc=True, errors="coerce")
    return df.sort_values("collectedAt")


# --- writing results ---------------------------------------------------------


def record_job_run(
    con: Connection,
    *,
    job: str,
    status: str,
    started_at: datetime,
    finished_at: datetime,
    summary: dict | None = None,
    error: str | None = None,
) -> None:
    """Log one pipeline run to JobRun (Task #34) — mirrors the collector's TS side.

    Recorded for failures too, so a stale site can be explained rather than
    just looking empty. Truncates `error` to keep rows small.
    """
    duration_ms = int((finished_at - started_at).total_seconds() * 1000)
    cur = con.cursor()
    cur.execute(
        """INSERT INTO "JobRun"
           (id, job, status, startedAt, finishedAt, durationMs, summary, error, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            uuid.uuid4().hex,
            job,
            status,
            started_at.isoformat(timespec="milliseconds"),
            finished_at.isoformat(timespec="milliseconds"),
            duration_ms,
            json.dumps(summary, separators=(",", ":")) if summary is not None else None,
            error[:2000] if error else None,
            iso_now(),
        ),
    )
    con.commit()


def write_results(con: Connection, kind: str, rows: list[dict]) -> int:
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
