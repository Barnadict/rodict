"use server";

/**
 * The localStorage watchlist (Task #35) only stores ids — the /watchlist page
 * calls these Server Functions to resolve them to live data, the same way
 * every other page reads through src/lib/db/*. Kept as a dedicated
 * "use server" file (not exported from src/lib/db) since these are meant to be
 * called directly from a Client Component, not from other server code.
 */

import { prisma } from "@/lib/prisma";
import { getGenreStats } from "@/lib/db/genre-stats";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { jsonSafe } from "@/lib/db/serialize";

export interface WatchlistGameData {
  universeId: string;
  name: string;
  currentPlaying: number;
  currentVisits: string;
  currentFavorites: number;
  genreName: string | null;
  status: string;
  estLow: number;
  estHigh: number;
}

export interface WatchlistGenreData {
  slug: string;
  name: string;
  gameCount: number;
  totalPlaying: number;
  estLow: number;
  estHigh: number;
}

/** Resolve watched games by universeId. Ids that fail to parse or no longer
 * exist are silently dropped — the caller diffs the result against what it
 * asked for to tell "removed" apart from "still loading". */
export async function fetchWatchlistGames(universeIds: string[]): Promise<WatchlistGameData[]> {
  const ids = universeIds
    .map((s) => {
      try {
        return BigInt(s);
      } catch {
        return null;
      }
    })
    .filter((v): v is bigint => v !== null);
  if (ids.length === 0) return [];

  const games = await prisma.game.findMany({
    where: { universeId: { in: ids } },
    include: { currentGenre: true },
  });

  return games.map((g) => {
    const est = estimateDailyEarningsFromCcu(g.currentPlaying);
    return jsonSafe({
      universeId: g.universeId,
      name: g.name,
      currentPlaying: g.currentPlaying,
      currentVisits: g.currentVisits,
      currentFavorites: g.currentFavorites,
      genreName: g.currentGenre?.name ?? null,
      status: g.status,
      estLow: est.low,
      estHigh: est.high,
    });
  });
}

/** Resolve watched genres by slug, using the same "now" rollup as /genres. */
export async function fetchWatchlistGenres(slugs: string[]): Promise<WatchlistGenreData[]> {
  if (slugs.length === 0) return [];
  const wanted = new Set(slugs);
  const stats = await getGenreStats();
  return stats
    .filter((s) => wanted.has(s.slug))
    .map((s) => {
      const est = estimateDailyEarningsFromCcu(s.totalPlaying);
      return {
        slug: s.slug,
        name: s.name,
        gameCount: s.gameCount,
        totalPlaying: s.totalPlaying,
        estLow: est.low,
        estHigh: est.high,
      };
    });
}
