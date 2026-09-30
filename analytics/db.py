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
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

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


def iso_prisma(ts: datetime | pd.Timestamp) -> str:
    """A timestamp in Prisma's SQLite DateTime text format (UTC, milliseconds)."""
    return pd.Timestamp(ts).tz_convert("UTC").to_pydatetime().isoformat(timespec="milliseconds")


# --- loaders (as DataFrames) -------------------------------------------------


def _parse_times(series: pd.Series) -> pd.Series:
    # Prisma stores ISO-8601 strings; naming the format parses far faster than
    # per-value inference, which matters at millions of snapshot rows.
    return pd.to_datetime(series, utc=True, errors="coerce", format="ISO8601")


def load_games(con: Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        """SELECT id, universeId, name, currentGenreId, allTimePeakPlayers,
                  currentPlaying, currentVisits, currentFavorites,
                  currentUpVotes, currentDownVotes,
                  robloxCreatedAt, firstSeenAt, status, deadSince
           FROM Game""",
        con,
    )
    for col in ("robloxCreatedAt", "firstSeenAt", "deadSince"):
        df[col] = _parse_times(df[col])
    return df


def load_game_snapshots(con: Connection) -> pd.DataFrame:
    """Every game snapshot, oldest first — only the columns a job reads.

    By far the largest read in the pipeline, so it happens ONCE per run (via
    `load_all`); no job calls it on its own (Task #44).
    """
    df = pd.read_sql_query("SELECT gameId, collectedAt, playing FROM GameSnapshot", con)
    df["collectedAt"] = _parse_times(df["collectedAt"])
    return df.sort_values("collectedAt", kind="stable").reset_index(drop=True)


def load_genres(con: Connection) -> pd.DataFrame:
    return pd.read_sql_query("SELECT id, slug, name FROM Genre WHERE isActive = 1", con)


def load_genre_snapshots(con: Connection) -> pd.DataFrame:
    df = pd.read_sql_query(
        "SELECT genreId, collectedAt, totalPlaying, totalGames FROM GenreSnapshot",
        con,
    )
    df["collectedAt"] = _parse_times(df["collectedAt"])
    return df.sort_values("collectedAt", kind="stable").reset_index(drop=True)


def load_game_updates(con: Connection) -> pd.DataFrame:
    """Recorded Roblox "last updated" events (Task #63): one row per change."""
    df = pd.read_sql_query('SELECT gameId, updatedAt FROM "GameUpdate"', con)
    df["updatedAt"] = _parse_times(df["updatedAt"])
    return df


@dataclass
class AnalyticsData:
    """Everything the jobs read, loaded once per run and shared (Task #44).

    Before this, each of the 9 jobs loaded what it needed itself: six full
    GameSnapshot scans and four GenreSnapshot scans per run over the network,
    which pushed most runs past the 20-minute timeout and multiplied Turso rows
    read. The union of what the jobs need is still the full snapshot history
    (survival, clustering and anomaly look at whole lifetimes), so the saving is
    in reading it once; jobs that need less slice it in memory (momentum's
    7-day window via `recent_game_snapshots`).
    """

    games: pd.DataFrame
    genres: pd.DataFrame
    game_snapshots: pd.DataFrame
    genre_snapshots: pd.DataFrame
    game_updates: pd.DataFrame = field(
        default_factory=lambda: pd.DataFrame({"gameId": [], "updatedAt": []})
    )
    _by_game: dict[str, pd.DataFrame] | None = field(default=None, init=False, repr=False)
    _daily: pd.DataFrame | None = field(default=None, init=False, repr=False)

    @property
    def now(self) -> pd.Timestamp:
        """The latest collection time — the 'as of' instant for ages and windows."""
        if self.game_snapshots.empty:
            return pd.Timestamp.now(tz="UTC")
        return self.game_snapshots["collectedAt"].max()

    def snaps_by_game(self) -> dict[str, pd.DataFrame]:
        """Snapshots grouped per game (each ascending), built once and shared."""
        if self._by_game is None:
            self._by_game = {gid: df for gid, df in self.game_snapshots.groupby("gameId", sort=False)}
        return self._by_game

    def daily_game_averages(self) -> pd.DataFrame:
        """Each game's mean players per UTC day: gameId, day (tz-aware midnight), avg.

        A busy game is collected ~8 times a day and a quiet one once, so jobs
        that compare games on the same day (concentration, rank ladders) compare
        daily averages. Built once and shared.
        """
        if self._daily is None:
            s = self.game_snapshots
            if s.empty:
                self._daily = pd.DataFrame({"gameId": [], "day": [], "avg": []})
            else:
                day = s["collectedAt"].dt.floor("D")
                self._daily = (
                    s.groupby([s["gameId"], day.rename("day")], sort=False)["playing"]
                    .mean()
                    .rename("avg")
                    .reset_index()
                )
        return self._daily

    def recent_game_snapshots(self, days: int) -> pd.DataFrame:
        """Only the last `days` of game snapshots, relative to `now`."""
        if self.game_snapshots.empty:
            return self.game_snapshots
        cutoff = self.now - timedelta(days=days)
        return self.game_snapshots[self.game_snapshots["collectedAt"] >= cutoff]

    def row_counts(self) -> dict[str, int]:
        return {
            "Game": len(self.games),
            "Genre": len(self.genres),
            "GameSnapshot": len(self.game_snapshots),
            "GenreSnapshot": len(self.genre_snapshots),
            "GameUpdate": len(self.game_updates),
        }


def load_all(con: Connection) -> AnalyticsData:
    return AnalyticsData(
        games=load_games(con),
        genres=load_genres(con),
        game_snapshots=load_game_snapshots(con),
        genre_snapshots=load_genre_snapshots(con),
        game_updates=load_game_updates(con),
    )


def run_standalone(job: Callable[[Connection, AnalyticsData], dict]) -> dict:
    """Run one job by itself (`python analytics/<job>.py`) with its own load."""
    con = connect()
    try:
        return job(con, load_all(con))
    finally:
        con.close()


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


# Rows per multi-row statement. Both stay under SQLite's classic 999
# bound-parameter limit (100 rows x 9 columns = 900), so the same SQL runs on
# local sqlite3 and on Turso.
DELETE_CHUNK = 500
UPSERT_CHUNK = 100


def _chunks(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def write_results(con: Connection, kind: str, rows: list[dict]) -> dict:
    """Sync the AnalyticsResult rows of `kind` to `rows`, writing only what changed.

    Each row: {scopeType, scopeId?, payload(dict), periodStart?, periodEnd?, version?}.
    Rows are keyed by (scopeType, scopeId): an unchanged result is left alone, a
    changed one is UPDATEd in place, a new scope is INSERTed and a scope that no
    longer appears is DELETEd. The stored set still equals the latest run (as
    the old delete-all-then-insert did), but a stable result costs no writes —
    and deletes and updates both count against Turso's monthly write cap, while
    most results (e.g. a quiet game's anomalies) are identical run to run (Task #43).

    The comparison is on the serialized payload string itself, which is exact and
    deterministic here (fixed key order, rounded floats), so no hash column is
    needed. Returns {inserted, updated, deleted, unchanged}.
    """
    now = iso_now()
    cur = con.cursor()
    cur.execute(
        """SELECT id, scopeType, scopeId, payload, version, periodStart, periodEnd
           FROM "AnalyticsResult" WHERE kind = ? ORDER BY computedAt DESC""",
        (kind,),
    )
    existing: dict[tuple, tuple] = {}
    delete_ids: list[str] = []
    for row_id, scope_type, scope_id, payload, version, p_start, p_end in cur.fetchall():
        key = (scope_type, scope_id)
        if key in existing:
            delete_ids.append(row_id)  # stray duplicate from an older run; newest wins
        else:
            existing[key] = (row_id, payload, version, p_start, p_end)

    inserts: list[tuple] = []
    updates: list[tuple] = []
    seen: set[tuple] = set()
    unchanged = 0
    for r in rows:
        key = (r["scopeType"], r.get("scopeId"))
        if key in seen:
            raise ValueError(f"{kind}: duplicate result for scope {key}")
        seen.add(key)
        payload = json.dumps(r["payload"], separators=(",", ":"))
        version = r.get("version", "1")
        p_start, p_end = r.get("periodStart"), r.get("periodEnd")

        prev = existing.get(key)
        if prev is None:
            inserts.append(
                (uuid.uuid4().hex, kind, key[0], key[1], p_start, p_end, now, version, payload)
            )
        elif prev[1:] == (payload, version, p_start, p_end):
            unchanged += 1
        else:
            # Same row id, so the upsert below updates it in place.
            updates.append((prev[0], kind, key[0], key[1], p_start, p_end, now, version, payload))
    delete_ids += [ref[0] for key, ref in existing.items() if key not in seen]

    # Multi-row statements, never `executemany`: against remote Turso the libsql
    # driver sends executemany as one network round trip PER ROW, so deleting
    # ~5.3K stale rows alone took minutes and ran analytics into its timeout.
    for ids in _chunks(delete_ids, DELETE_CHUNK):
        cur.execute(
            f'DELETE FROM "AnalyticsResult" WHERE id IN ({", ".join("?" * len(ids))})', ids
        )
    for group in _chunks(inserts + updates, UPSERT_CHUNK):
        placeholders = ", ".join(["(?, ?, ?, ?, ?, ?, ?, ?, ?)"] * len(group))
        cur.execute(
            f"""INSERT INTO "AnalyticsResult"
                (id, kind, scopeType, scopeId, periodStart, periodEnd, computedAt, version, payload)
                VALUES {placeholders}
                ON CONFLICT(id) DO UPDATE SET
                  payload = excluded.payload, version = excluded.version,
                  periodStart = excluded.periodStart, periodEnd = excluded.periodEnd,
                  computedAt = excluded.computedAt""",
            [v for row in group for v in row],
        )
    con.commit()
    return {
        "inserted": len(inserts),
        "updated": len(updates),
        "deleted": len(delete_ids),
        "unchanged": unchanged,
    }
