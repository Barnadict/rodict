import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Rising / trending computations (Task #17, reworked in Task #53).
 *
 * CCU swings strongly over a day, so comparing two single snapshots taken at
 * different hours mostly measures time of day, and with no floor a game going
 * from 2 to 40 players tops the list at +1900%. So growth compares DAILY
 * AVERAGES: the mean of each series' readings over the first
 * RISING.avgWindowHours of the window (baseline) against the mean over the last
 * RISING.avgWindowHours (current). A series needs at least two full averaging
 * windows of history inside the range, and a baseline of at least
 * RISING.minBaseline players, or it isn't ranked; only series that grew are
 * listed. `cutoff` undefined means "all
 * history": the baseline window starts at the earliest snapshot ever recorded.
 *
 * Reads: driven from the Game table (pre-filtered on the all-time peak, since a
 * baseline average of N players needs some reading of at least N), each game
 * costs two index seeks (first/last reading) plus two short index range scans,
 * one per averaging window, on GameSnapshot's (gameId, collectedAt) unique
 * index. That's ~a day of readings per side regardless of range length, where
 * the previous version scanned every snapshot in the window (Turso bills rows
 * read). The date arithmetic uses SQLite's julianday/strftime, and relies on
 * Prisma storing DateTime as ISO-8601 text with a "+00:00" suffix, which
 * strftime reproduces so the window bounds compare as text on the index. The
 * CTEs are MATERIALIZED because SQLite otherwise inlines them and re-runs each
 * correlated subquery once per reference (checked with EXPLAIN QUERY PLAN).
 */

export const RISING = {
  /** Minimum baseline daily-average players for a series to be ranked. */
  minBaseline: 100,
  /** Length of each averaging window, at the start and end of the range. */
  avgWindowHours: 24,
} as const;

const AVG_DAYS = RISING.avgWindowHours / 24;
/** Prisma's SQLite DateTime text format, so computed bounds compare as text. */
export const TS_FORMAT = "%Y-%m-%dT%H:%M:%f+00:00";

export interface RisingGameRow {
  id: string;
  universeId: bigint;
  name: string;
  genreName: string | null;
  /** Average players over the first averaging window of the range. */
  basePlaying: number;
  /** Average players over the last averaging window of the range. */
  currentPlaying: number;
  delta: number;
  /** (current − base) / base. The baseline floor keeps base > 0. */
  growthPct: number | null;
}

export interface RisingParams {
  /** Undefined = all history (compares the earliest-ever day to the latest). */
  cutoff?: Date;
  limit?: number;
}

function toGrowth<T extends { basePlaying: number; currentPlaying: number }>(r: T) {
  const basePlaying = Number(r.basePlaying);
  const currentPlaying = Number(r.currentPlaying);
  return {
    ...r,
    basePlaying,
    currentPlaying,
    delta: currentPlaying - basePlaying,
    growthPct: basePlaying > 0 ? (currentPlaying - basePlaying) / basePlaying : null,
  };
}

export async function getRisingGames(params: RisingParams): Promise<RisingGameRow[]> {
  const { cutoff, limit = 25 } = params;
  return queryGameWindowGrowth(cutoff, { onlyGrowing: true, limit });
}

/**
 * Window growth for EVERY rankable game, rising or falling (Task #70's growth
 * sort on /games): the same daily-average rule and baseline floor as
 * getRisingGames, so the two never disagree. Unordered; callers rank it.
 */
export function getGameWindowGrowth(cutoff: Date | undefined): Promise<RisingGameRow[]> {
  return queryGameWindowGrowth(cutoff, { onlyGrowing: false });
}

async function queryGameWindowGrowth(
  cutoff: Date | undefined,
  opts: { onlyGrowing: boolean; limit?: number },
): Promise<RisingGameRow[]> {
  const grew = opts.onlyGrowing
    ? Prisma.sql`AND a."currentPlaying" > a."basePlaying"`
    : Prisma.empty;
  const tail =
    opts.limit !== undefined
      ? Prisma.sql`ORDER BY (a."currentPlaying" - a."basePlaying") / a."basePlaying" DESC
    LIMIT ${opts.limit}`
      : Prisma.empty;
  const inWindow = cutoff ? Prisma.sql`AND s."collectedAt" >= ${cutoff}` : Prisma.empty;
  const seenInWindow = cutoff ? Prisma.sql`AND g."lastSnapshotAt" >= ${cutoff}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      universeId: bigint;
      name: string;
      genreName: string | null;
      basePlaying: number;
      currentPlaying: number;
    }[]
  >`
    WITH bounds AS MATERIALIZED (
      SELECT
        g.id, g."universeId", g.name, g."currentGenreId",
        (SELECT MIN(s."collectedAt") FROM "GameSnapshot" s
          WHERE s."gameId" = g.id ${inWindow}) AS "firstAt",
        (SELECT MAX(s."collectedAt") FROM "GameSnapshot" s
          WHERE s."gameId" = g.id) AS "lastAt"
      FROM "Game" g
      WHERE g."allTimePeakPlayers" >= ${RISING.minBaseline} ${seenInWindow}
    ),
    spans AS (
      SELECT *,
        strftime(${TS_FORMAT}, julianday("firstAt") + ${AVG_DAYS}) AS "baseEnd",
        strftime(${TS_FORMAT}, julianday("lastAt") - ${AVG_DAYS}) AS "curStart"
      FROM bounds
      WHERE "firstAt" IS NOT NULL
        AND julianday("lastAt") - julianday("firstAt") >= ${2 * AVG_DAYS}
    ),
    avgs AS MATERIALIZED (
      SELECT sp.*,
        (SELECT AVG(s.playing) FROM "GameSnapshot" s
          WHERE s."gameId" = sp.id
            AND s."collectedAt" >= sp."firstAt" AND s."collectedAt" < sp."baseEnd") AS "basePlaying",
        (SELECT AVG(s.playing) FROM "GameSnapshot" s
          WHERE s."gameId" = sp.id
            AND s."collectedAt" > sp."curStart" AND s."collectedAt" <= sp."lastAt") AS "currentPlaying"
      FROM spans sp
    )
    SELECT
      a.id           AS "id",
      a."universeId" AS "universeId",
      a.name         AS "name",
      gen.name       AS "genreName",
      a."basePlaying",
      a."currentPlaying"
    FROM avgs a
    LEFT JOIN "Genre" gen ON gen.id = a."currentGenreId"
    WHERE a."basePlaying" >= ${RISING.minBaseline} ${grew}
    ${tail}
  `;

  return rows.map(toGrowth);
}

export interface RisingGenreRow {
  id: string;
  slug: string;
  name: string;
  /** Average total players over the first averaging window of the range. */
  basePlaying: number;
  /** Average total players over the last averaging window of the range. */
  currentPlaying: number;
  delta: number;
  growthPct: number | null;
}

/** Genre counterpart of getRisingGames, over GenreSnapshot.totalPlaying. */
export async function getRisingGenres(params: RisingParams): Promise<RisingGenreRow[]> {
  const { cutoff, limit = 25 } = params;
  const inWindow = cutoff ? Prisma.sql`AND s."collectedAt" >= ${cutoff}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      basePlaying: number;
      currentPlaying: number;
    }[]
  >`
    WITH bounds AS MATERIALIZED (
      SELECT
        gen.id, gen.slug, gen.name,
        (SELECT MIN(s."collectedAt") FROM "GenreSnapshot" s
          WHERE s."genreId" = gen.id ${inWindow}) AS "firstAt",
        (SELECT MAX(s."collectedAt") FROM "GenreSnapshot" s
          WHERE s."genreId" = gen.id) AS "lastAt"
      FROM "Genre" gen
    ),
    spans AS (
      SELECT *,
        strftime(${TS_FORMAT}, julianday("firstAt") + ${AVG_DAYS}) AS "baseEnd",
        strftime(${TS_FORMAT}, julianday("lastAt") - ${AVG_DAYS}) AS "curStart"
      FROM bounds
      WHERE "firstAt" IS NOT NULL
        AND julianday("lastAt") - julianday("firstAt") >= ${2 * AVG_DAYS}
    ),
    avgs AS MATERIALIZED (
      SELECT sp.*,
        (SELECT AVG(s."totalPlaying") FROM "GenreSnapshot" s
          WHERE s."genreId" = sp.id
            AND s."collectedAt" >= sp."firstAt" AND s."collectedAt" < sp."baseEnd") AS "basePlaying",
        (SELECT AVG(s."totalPlaying") FROM "GenreSnapshot" s
          WHERE s."genreId" = sp.id
            AND s."collectedAt" > sp."curStart" AND s."collectedAt" <= sp."lastAt") AS "currentPlaying"
      FROM spans sp
    )
    SELECT id, slug, name, "basePlaying", "currentPlaying"
    FROM avgs
    WHERE "basePlaying" >= ${RISING.minBaseline} AND "currentPlaying" > "basePlaying"
    ORDER BY ("currentPlaying" - "basePlaying") / "basePlaying" DESC
    LIMIT ${limit}
  `;

  return rows.map(toGrowth);
}

export interface GameGrowth {
  basePlaying: number;
  currentPlaying: number;
  delta: number;
  growthPct: number | null;
  snapshotCount: number;
}

/**
 * Growth over a range for a SPECIFIC set of games (the ones already on the
 * current page of a list) — used for the games-list Δ column (Task #19) so
 * selecting a range doesn't require rebuilding the whole list historically.
 * Games with fewer than 2 snapshots in range are simply absent from the result
 * map (caller renders "—").
 */
export async function getGrowthForGames(
  gameIds: string[],
  cutoff?: Date,
): Promise<Map<string, GameGrowth>> {
  if (gameIds.length === 0) return new Map();
  const filter = cutoff ? Prisma.sql`AND "collectedAt" >= ${cutoff}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    { gameId: string; basePlaying: number; currentPlaying: number; snapshotCount: number }[]
  >`
    SELECT
      w."gameId" AS "gameId",
      first.playing AS "basePlaying",
      last.playing  AS "currentPlaying",
      w.cnt AS "snapshotCount"
    FROM (
      SELECT "gameId", COUNT(*) AS cnt
      FROM "GameSnapshot"
      WHERE "gameId" IN (${Prisma.join(gameIds)}) ${filter}
      GROUP BY "gameId"
      HAVING COUNT(*) >= 2
    ) w
    JOIN "GameSnapshot" first
      ON first."gameId" = w."gameId"
      AND first."collectedAt" = (
        SELECT MIN("collectedAt") FROM "GameSnapshot"
        WHERE "gameId" = w."gameId" ${filter}
      )
    JOIN "GameSnapshot" last
      ON last."gameId" = w."gameId"
      AND last."collectedAt" = (
        SELECT MAX("collectedAt") FROM "GameSnapshot"
        WHERE "gameId" = w."gameId" ${filter}
      )
  `;

  const map = new Map<string, GameGrowth>();
  for (const r of rows) {
    map.set(r.gameId, {
      basePlaying: r.basePlaying,
      currentPlaying: r.currentPlaying,
      delta: r.currentPlaying - r.basePlaying,
      growthPct: r.basePlaying > 0 ? (r.currentPlaying - r.basePlaying) / r.basePlaying : null,
      snapshotCount: Number(r.snapshotCount),
    });
  }
  return map;
}
