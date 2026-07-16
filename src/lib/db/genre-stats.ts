import { prisma } from "@/lib/prisma";
import { getAllGenres } from "@/lib/db/genres";

export type GenreStatsSort = "gameCount" | "totalPlaying" | "totalVisits" | "totalFavorites";

export interface GenreStatsRow {
  genreId: string | null;
  slug: string;
  name: string;
  gameCount: number;
  totalPlaying: number;
  totalVisits: bigint;
  totalFavorites: number;
}

export interface GenreStatsParams {
  /** Show stats as they stood at this UTC instant. Omit for "now" (fast path,
   * reads the denormalized current metrics — no historical join needed). */
  asOf?: Date;
  sort?: GenreStatsSort;
  order?: "asc" | "desc";
}

const UNCLASSIFIED = { slug: "unclassified", name: "Unclassified" };

/**
 * Genre-level rollups for the /genres leaderboard.
 *
 * "now" (no asOf): a single Prisma groupBy over Game's denormalized current
 * metrics — cheap, matches what the games list shows.
 *
 * A historical `asOf`: each game's genre assignment AT that instant comes from
 * GameGenreHistory (time-bounded, since genre can change), and its metrics come
 * from its latest GameSnapshot at-or-before that instant. Both are "latest row
 * per group" problems, solved with one window-function query rather than N+1
 * per-game lookups. If a game had no snapshot yet at `asOf`, it's correctly
 * excluded — that instant predates its collection history.
 */
export async function getGenreStats(params: GenreStatsParams = {}): Promise<GenreStatsRow[]> {
  const { asOf, sort = "totalPlaying", order = "desc" } = params;
  const genres = await getAllGenres();
  const genreById = new Map(genres.map((g) => [g.id, g]));

  type Agg = {
    genreId: string | null;
    gameCount: number;
    totalPlaying: number;
    totalVisits: bigint;
    totalFavorites: number;
  };

  let aggregates: Agg[];

  if (!asOf) {
    const grouped = await prisma.game.groupBy({
      by: ["currentGenreId"],
      _count: { _all: true },
      _sum: { currentPlaying: true, currentVisits: true, currentFavorites: true },
    });
    aggregates = grouped.map((g) => ({
      genreId: g.currentGenreId,
      gameCount: g._count._all,
      totalPlaying: g._sum.currentPlaying ?? 0,
      totalVisits: g._sum.currentVisits ?? BigInt(0),
      totalFavorites: g._sum.currentFavorites ?? 0,
    }));
  } else {
    aggregates = await prisma.$queryRaw<Agg[]>`
      WITH latest_snapshot AS (
        SELECT gs.*,
          ROW_NUMBER() OVER (PARTITION BY gs."gameId" ORDER BY gs."collectedAt" DESC) AS rn
        FROM "GameSnapshot" gs
        WHERE gs."collectedAt" <= ${asOf}
      ),
      genre_at_date AS (
        SELECT ggh."gameId", ggh."genreId",
          ROW_NUMBER() OVER (PARTITION BY ggh."gameId" ORDER BY ggh."assignedAt" DESC) AS rn
        FROM "GameGenreHistory" ggh
        WHERE ggh."assignedAt" <= ${asOf}
          AND (ggh."endedAt" IS NULL OR ggh."endedAt" > ${asOf})
      )
      SELECT
        gad."genreId" AS "genreId",
        CAST(COUNT(*) AS INTEGER) AS "gameCount",
        CAST(SUM(ls.playing) AS INTEGER) AS "totalPlaying",
        SUM(ls.visits) AS "totalVisits",
        CAST(SUM(ls.favorites) AS INTEGER) AS "totalFavorites"
      FROM latest_snapshot ls
      JOIN genre_at_date gad ON gad."gameId" = ls."gameId" AND gad.rn = 1
      WHERE ls.rn = 1
      GROUP BY gad."genreId"
    `;
  }

  const rows: GenreStatsRow[] = aggregates.map((a) => {
    const genre = a.genreId ? genreById.get(a.genreId) : undefined;
    return {
      genreId: a.genreId,
      slug: genre?.slug ?? UNCLASSIFIED.slug,
      name: genre?.name ?? UNCLASSIFIED.name,
      gameCount: a.gameCount,
      totalPlaying: a.totalPlaying,
      totalVisits: a.totalVisits,
      totalFavorites: a.totalFavorites,
    };
  });

  rows.sort((a, b) => {
    const diff = sort === "totalVisits" ? Number(a.totalVisits - b.totalVisits) : a[sort] - b[sort];
    return order === "asc" ? diff : -diff;
  });

  return rows;
}

/** Convenience: the "now" rollup for a single genre by slug. */
export async function getGenreStatBySlug(slug: string): Promise<GenreStatsRow | null> {
  const all = await getGenreStats();
  return all.find((r) => r.slug === slug) ?? null;
}

export interface LifecyclePoint {
  weekAge: number;
  avgPlaying: number;
  sampleCount: number;
}

/**
 * "Basic" lifecycle curve (Task #16): average concurrent players of a genre's
 * games bucketed by weeks since each game's launch (robloxCreatedAt). This is
 * the descriptive version — the rigorous, censoring-aware survival/clustering
 * analysis is Phase 4 (Tasks #21/#23).
 *
 * Computed in JS (not SQL date math) to stay portable across SQLite/Postgres.
 * Cold-start caveat: until months of history accrue, most snapshots land in a
 * narrow age band (our games are old but our history is young), so the curve is
 * sparse — expected, not a bug.
 */
export async function getGenreLifecycle(
  genreId: string,
  maxWeeks = 260,
): Promise<LifecyclePoint[]> {
  const games = await prisma.game.findMany({
    where: { currentGenreId: genreId, robloxCreatedAt: { not: null } },
    select: { id: true, robloxCreatedAt: true },
  });
  if (games.length === 0) return [];

  const createdById = new Map(games.map((g) => [g.id, g.robloxCreatedAt!]));
  const snaps = await prisma.gameSnapshot.findMany({
    where: { gameId: { in: games.map((g) => g.id) } },
    select: { gameId: true, playing: true, collectedAt: true },
  });

  const WEEK_MS = 7 * 86_400_000;
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const s of snaps) {
    const created = createdById.get(s.gameId);
    if (!created) continue;
    const weekAge = Math.floor((s.collectedAt.getTime() - created.getTime()) / WEEK_MS);
    if (weekAge < 0 || weekAge > maxWeeks) continue;
    const b = buckets.get(weekAge) ?? { sum: 0, count: 0 };
    b.sum += s.playing;
    b.count++;
    buckets.set(weekAge, b);
  }

  return [...buckets.entries()]
    .map(([weekAge, b]) => ({ weekAge, avgPlaying: b.sum / b.count, sampleCount: b.count }))
    .sort((a, b) => a.weekAge - b.weekAge);
}
