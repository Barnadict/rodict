import { COLLECTION_CADENCE } from "@/lib/collector/cadence";
import { prisma } from "@/lib/prisma";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const HOUR_MS = 3_600_000;

/**
 * How old a game's latest reading may be and still count toward a genre point
 * (Task #52). Quiet games are collected about once a day (Task #46), landing up
 * to one run interval late; one more run interval tolerates a single missed or
 * paused run. Anything older is left out of the point and lowers its coverage.
 */
export const GENRE_CARRY_MAX_AGE_HOURS =
  COLLECTION_CADENCE.lowIntervalHours + 2 * COLLECTION_CADENCE.runIntervalHours;

export interface GenreAggregateInput {
  currentGenreId: string;
  currentPlaying: number;
  currentVisits: bigint;
  currentFavorites: number;
  lastSnapshotAt: Date | null;
}

export interface GenreAggregate {
  genreId: string;
  totalGames: number;
  totalPlaying: number;
  totalVisits: bigint;
  totalFavorites: bigint;
  avgPlaying: number;
  medianPlaying: number | null;
  /** Share of the genre's classified games whose reading is in this point (0–1). */
  coverage: number;
}

/**
 * Build one genre point per genre from a single time slice (pure, tested).
 *
 * A game counts if it was collected in this run (its `lastSnapshotAt` is the
 * run's `collectedAt`) or its latest reading is at most `maxAgeHours` old,
 * which carries a quiet game's daily reading forward between collections.
 * Older readings (a game missed by partial runs) are left out rather than
 * mixed in, and `coverage` records how much of the genre the point covers.
 * A genre with nothing recent enough gets no point at all.
 */
export function aggregateGenreSnapshots(
  games: GenreAggregateInput[],
  collectedAt: Date,
  maxAgeHours = GENRE_CARRY_MAX_AGE_HOURS,
): GenreAggregate[] {
  const oldestAllowed = collectedAt.getTime() - maxAgeHours * HOUR_MS;
  const byGenre = new Map<
    string,
    { playing: number[]; visits: bigint; favorites: number; classified: number }
  >();

  for (const g of games) {
    const entry = byGenre.get(g.currentGenreId) ?? {
      playing: [],
      visits: BigInt(0),
      favorites: 0,
      classified: 0,
    };
    entry.classified++;
    const at = g.lastSnapshotAt?.getTime();
    if (at !== undefined && at >= oldestAllowed && at <= collectedAt.getTime()) {
      entry.playing.push(g.currentPlaying);
      entry.visits += g.currentVisits;
      entry.favorites += g.currentFavorites;
    }
    byGenre.set(g.currentGenreId, entry);
  }

  const out: GenreAggregate[] = [];
  for (const [genreId, entry] of byGenre) {
    const totalGames = entry.playing.length;
    if (totalGames === 0) continue;
    const totalPlaying = entry.playing.reduce((a, b) => a + b, 0);
    out.push({
      genreId,
      totalGames,
      totalPlaying,
      totalVisits: entry.visits,
      totalFavorites: BigInt(entry.favorites),
      avgPlaying: totalPlaying / totalGames,
      medianPlaying: median(entry.playing),
      coverage: totalGames / entry.classified,
    });
  }
  return out;
}

/**
 * Precompute a per-genre aggregate snapshot for this collection run and store it
 * in GenreSnapshot (Task #4's designed home for genre time series). Genre pages
 * then read one row per point instead of aggregating raw GameSnapshots on every
 * request (standing optimization rule). Called at the end of a collection run.
 *
 * Only classified games contribute (GenreSnapshot.genreId is a required FK).
 * `Game.current*` mirrors each game's latest snapshot, so for games collected
 * this run it IS this run's snapshot; see aggregateGenreSnapshots for the rest.
 */
export async function persistGenreSnapshots(collectedAt: Date): Promise<number> {
  // Each upsert is one row written; with a fresh `collectedAt` per run it's
  // always an insert, so the caller counts the return value as GenreSnapshot
  // inserts (Task #42).
  const games = await prisma.game.findMany({
    where: { currentGenreId: { not: null } },
    select: {
      currentGenreId: true,
      currentPlaying: true,
      currentVisits: true,
      currentFavorites: true,
      lastSnapshotAt: true,
    },
  });

  const aggregates = aggregateGenreSnapshots(
    games.map((g) => ({ ...g, currentGenreId: g.currentGenreId! })),
    collectedAt,
  );

  let written = 0;
  for (const { genreId, ...data } of aggregates) {
    await prisma.genreSnapshot.upsert({
      where: { genreId_collectedAt: { genreId, collectedAt } },
      update: data,
      create: { genreId, collectedAt, ...data },
    });
    written++;
  }

  return written;
}

export interface GenreSnapshotRange {
  from?: Date;
  to?: Date;
}

/** Genre aggregate time series, oldest-first (for the genre trend chart). */
export function getGenreSnapshots(genreId: string, range: GenreSnapshotRange = {}) {
  const { from, to } = range;
  return prisma.genreSnapshot.findMany({
    where: {
      genreId,
      ...(from || to
        ? { collectedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { collectedAt: "asc" },
  });
}
