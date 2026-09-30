"use server";

/**
 * The localStorage watchlist (Task #35) only stores ids — the /watchlist page
 * calls these Server Functions to resolve them to live data, the same way
 * every other page reads through src/lib/db/*. Kept as a dedicated
 * "use server" file (not exported from src/lib/db) since these are meant to be
 * called directly from a Client Component, not from other server code.
 */

import { cacheLife } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSmallIcons } from "@/lib/game-icons";
import { getGameSparklines, getGenreSparklines } from "@/lib/db/sparklines";
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
  /** Small icon URL (Task #103). */
  icon: string | null;
  /** 7-day daily average players (Task #102). */
  spark: (number | null)[];
}

export interface WatchlistGenreData {
  slug: string;
  name: string;
  gameCount: number;
  totalPlaying: number;
  estLow: number;
  estHigh: number;
  spark: (number | null)[];
}

/**
 * Icons and sparklines for a watched set, cached on the sorted id list so a
 * reload (or another visitor watching the same games) reuses it.
 */
async function getGameExtras(gameIds: string[], universeIds: string[]) {
  "use cache";
  cacheLife("hours");
  const [icons, sparks] = await Promise.all([
    getSmallIcons(universeIds),
    getGameSparklines(gameIds),
  ]);
  return { icons: Object.fromEntries(icons), sparks };
}

async function getGenreExtras(genreIds: string[]) {
  "use cache";
  cacheLife("hours");
  return getGenreSparklines(genreIds);
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
    include: {
      currentGenre: true,
      passCatalog: { select: { forSaleCount: true, totalRobux: true } },
    },
  });

  const sorted = [...games].sort((a, b) => a.id.localeCompare(b.id));
  const extras = await getGameExtras(
    sorted.map((g) => g.id),
    sorted.map((g) => g.universeId.toString()),
  );

  return games.map((g) => {
    const est = estimateDailyEarningsFromCcu(g.currentPlaying, undefined, g.passCatalog);
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
      icon: extras.icons[g.universeId.toString()] ?? null,
      spark: extras.sparks[g.id] ?? [],
    });
  });
}

/** Resolve watched genres by slug, using the same "now" rollup as /genres. */
export async function fetchWatchlistGenres(slugs: string[]): Promise<WatchlistGenreData[]> {
  if (slugs.length === 0) return [];
  const wanted = new Set(slugs);
  const stats = (await getGenreStats()).filter((s) => wanted.has(s.slug));
  const ids = stats.flatMap((s) => (s.genreId ? [s.genreId] : [])).sort();
  const sparks = await getGenreExtras(ids);
  return stats.map((s) => {
    const est = estimateDailyEarningsFromCcu(s.totalPlaying);
    return {
      slug: s.slug,
      name: s.name,
      gameCount: s.gameCount,
      totalPlaying: s.totalPlaying,
      estLow: est.low,
      estHigh: est.high,
      spark: (s.genreId && sparks[s.genreId]) || [],
    };
  });
}
