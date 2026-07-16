import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Rising / trending computations (Task #17), extended for Task #19's shared
 * date-range control.
 *
 * Growth is measured over a window as (latest − earliest) / earliest using the
 * snapshots we actually have INSIDE that window: baseline = earliest snapshot
 * at-or-after `cutoff`, current = latest snapshot. `cutoff` undefined means "all
 * history" — baseline is the earliest snapshot ever recorded. This is honest
 * under cold-start — if we only have a few recent snapshots, growth simply
 * reflects the change across the history that exists (and anything with a
 * single snapshot in range is excluded, since there's nothing to compare).
 *
 * The earliest/latest-in-window pick uses correlated MIN/MAX subqueries (plain
 * ANSI SQL, portable to SQLite + Postgres) rather than N+1 per-row queries.
 */

export interface RisingGameRow {
  id: string;
  universeId: bigint;
  name: string;
  genreName: string | null;
  basePlaying: number;
  currentPlaying: number;
  delta: number;
  /** (current − base) / base, or null when base is 0. */
  growthPct: number | null;
  snapshotCount: number;
  fromAt: Date;
  toAt: Date;
}

export interface RisingParams {
  /** Undefined = all history (compares the earliest-ever snapshot to the latest). */
  cutoff?: Date;
  limit?: number;
}

export async function getRisingGames(params: RisingParams): Promise<RisingGameRow[]> {
  const { cutoff, limit = 25 } = params;
  const filter = cutoff ? Prisma.sql`WHERE "collectedAt" >= ${cutoff}` : Prisma.empty;
  const filterAnd = cutoff ? Prisma.sql`AND "collectedAt" >= ${cutoff}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      universeId: bigint;
      name: string;
      genreName: string | null;
      basePlaying: number;
      currentPlaying: number;
      snapshotCount: number;
      fromAt: Date;
      toAt: Date;
    }[]
  >`
    SELECT
      g.id            AS "id",
      g."universeId"  AS "universeId",
      g.name          AS "name",
      gen.name        AS "genreName",
      first.playing   AS "basePlaying",
      last.playing    AS "currentPlaying",
      w.cnt           AS "snapshotCount",
      first."collectedAt" AS "fromAt",
      last."collectedAt"  AS "toAt"
    FROM (
      SELECT "gameId", COUNT(*) AS cnt
      FROM "GameSnapshot"
      ${filter}
      GROUP BY "gameId"
      HAVING COUNT(*) >= 2
    ) w
    JOIN "Game" g ON g.id = w."gameId"
    LEFT JOIN "Genre" gen ON gen.id = g."currentGenreId"
    JOIN "GameSnapshot" first
      ON first."gameId" = w."gameId"
      AND first."collectedAt" = (
        SELECT MIN("collectedAt") FROM "GameSnapshot"
        WHERE "gameId" = w."gameId" ${filterAnd}
      )
    JOIN "GameSnapshot" last
      ON last."gameId" = w."gameId"
      AND last."collectedAt" = (
        SELECT MAX("collectedAt") FROM "GameSnapshot"
        WHERE "gameId" = w."gameId" ${filterAnd}
      )
  `;

  return rows
    .map((r) => ({
      ...r,
      snapshotCount: Number(r.snapshotCount),
      delta: r.currentPlaying - r.basePlaying,
      growthPct: r.basePlaying > 0 ? (r.currentPlaying - r.basePlaying) / r.basePlaying : null,
    }))
    .sort((a, b) => (b.growthPct ?? -Infinity) - (a.growthPct ?? -Infinity))
    .slice(0, limit);
}

export interface RisingGenreRow {
  id: string;
  slug: string;
  name: string;
  basePlaying: number;
  currentPlaying: number;
  delta: number;
  growthPct: number | null;
  snapshotCount: number;
}

export async function getRisingGenres(params: RisingParams): Promise<RisingGenreRow[]> {
  const { cutoff, limit = 25 } = params;
  const filter = cutoff ? Prisma.sql`WHERE "collectedAt" >= ${cutoff}` : Prisma.empty;
  const filterAnd = cutoff ? Prisma.sql`AND "collectedAt" >= ${cutoff}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      basePlaying: number;
      currentPlaying: number;
      snapshotCount: number;
    }[]
  >`
    SELECT
      gen.id   AS "id",
      gen.slug AS "slug",
      gen.name AS "name",
      first."totalPlaying" AS "basePlaying",
      last."totalPlaying"  AS "currentPlaying",
      w.cnt AS "snapshotCount"
    FROM (
      SELECT "genreId", COUNT(*) AS cnt
      FROM "GenreSnapshot"
      ${filter}
      GROUP BY "genreId"
      HAVING COUNT(*) >= 2
    ) w
    JOIN "Genre" gen ON gen.id = w."genreId"
    JOIN "GenreSnapshot" first
      ON first."genreId" = w."genreId"
      AND first."collectedAt" = (
        SELECT MIN("collectedAt") FROM "GenreSnapshot"
        WHERE "genreId" = w."genreId" ${filterAnd}
      )
    JOIN "GenreSnapshot" last
      ON last."genreId" = w."genreId"
      AND last."collectedAt" = (
        SELECT MAX("collectedAt") FROM "GenreSnapshot"
        WHERE "genreId" = w."genreId" ${filterAnd}
      )
  `;

  return rows
    .map((r) => ({
      ...r,
      snapshotCount: Number(r.snapshotCount),
      delta: r.currentPlaying - r.basePlaying,
      growthPct: r.basePlaying > 0 ? (r.currentPlaying - r.basePlaying) / r.basePlaying : null,
    }))
    .sort((a, b) => (b.growthPct ?? -Infinity) - (a.growthPct ?? -Infinity))
    .slice(0, limit);
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
