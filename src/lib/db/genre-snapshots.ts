import { prisma } from "@/lib/prisma";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Precompute a per-genre aggregate snapshot for this collection run and store it
 * in GenreSnapshot (Task #4's designed home for genre time series). Genre pages
 * then read one row per point instead of aggregating raw GameSnapshots on every
 * request (standing optimization rule). Called at the end of a collection run.
 *
 * Only classified games contribute (GenreSnapshot.genreId is a required FK).
 */
export async function persistGenreSnapshots(collectedAt: Date): Promise<number> {
  const games = await prisma.game.findMany({
    where: { currentGenreId: { not: null } },
    select: {
      currentGenreId: true,
      currentPlaying: true,
      currentVisits: true,
      currentFavorites: true,
    },
  });

  const byGenre = new Map<string, { playing: number[]; visits: bigint; favorites: number }>();
  for (const g of games) {
    const id = g.currentGenreId!;
    const entry = byGenre.get(id) ?? { playing: [], visits: BigInt(0), favorites: 0 };
    entry.playing.push(g.currentPlaying);
    entry.visits += g.currentVisits;
    entry.favorites += g.currentFavorites;
    byGenre.set(id, entry);
  }

  let written = 0;
  for (const [genreId, entry] of byGenre) {
    const totalGames = entry.playing.length;
    const totalPlaying = entry.playing.reduce((a, b) => a + b, 0);
    const data = {
      totalGames,
      totalPlaying,
      totalVisits: entry.visits,
      totalFavorites: BigInt(entry.favorites),
      avgPlaying: totalGames ? totalPlaying / totalGames : 0,
      medianPlaying: median(entry.playing),
    };
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
