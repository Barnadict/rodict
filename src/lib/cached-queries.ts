import { cacheLife } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getGameWindowGrowth, getRisingGames, getRisingGenres } from "@/lib/db/trends";
import { getWeeklyDeaths, getWeeklyEntrants } from "@/lib/db/weekly";
import { getEngagementIndex } from "@/lib/db/engagement";
import { getConcentrationAll, getRankLadders, getRecentAnomalies } from "@/lib/db/analytics";
import { getPassPricingIndex } from "@/lib/db/pass-pricing";
import { getUpdateCadenceIndex } from "@/lib/db/update-cadence";
import { rangeToCutoff, type RangeKey } from "@/lib/date-range";
import { WEEKLY_DAYS, WEEKLY_LIMIT, weeklySpikes, type WeeklyData } from "@/lib/weekly";

/**
 * Window growth for every rankable game, keyed only by the range so /games and
 * its export share one entry across all filter combinations (Task #70). Same
 * rule as /trending: first-day vs last-day average players, with the baseline
 * floor.
 */
export async function getGrowthRanking(range: RangeKey) {
  "use cache";
  cacheLife("hours");
  const rows = await getGameWindowGrowth(rangeToCutoff(range));
  return rows.map((r) => ({ id: r.id, growthPct: r.growthPct }));
}

/** growthPct by game id, games without a figure left out. */
export async function getGrowthById(range: RangeKey): Promise<Map<string, number>> {
  const rows = await getGrowthRanking(range);
  return new Map(rows.flatMap((r) => (r.growthPct === null ? [] : [[r.id, r.growthPct]])));
}

/**
 * Est. session lengths and genre engagement ratios (Task #82), one entry for
 * the whole site: the game page, genre page, /games' "stickiest" sort and its
 * export all read this, so a cache refresh costs one ~day of snapshot reads.
 */
export async function getEngagement() {
  "use cache";
  cacheLife("hours");
  return getEngagementIndex();
}

/** Est. minutes per visit by game id; games without an estimate left out. */
export async function getSessionById(): Promise<Map<string, number>> {
  const { games } = await getEngagement();
  return new Map(games.map((g) => [g.id, g.minutes]));
}

/**
 * Every stored daily rank ladder (Task #90, ≤90 rows), shared by all game
 * pages: each page slices the days its range covers instead of reading them.
 */
export async function getAllRankLadders() {
  "use cache";
  cacheLife("hours");
  return getRankLadders();
}

/** Every genre's concentration series (Task #87), as [genreId, series] pairs. */
export async function getConcentrationIndex() {
  "use cache";
  cacheLife("hours");
  return [...(await getConcentrationAll())];
}

/** Update cadence for every genre (Task #88); growth over the same 30 days. */
export async function getUpdateCadence() {
  "use cache";
  cacheLife("hours");
  // The "30d" range is CADENCE.recentDays; update-cadence.test.ts pins that.
  const growth = await getGrowthById("30d");
  return getUpdateCadenceIndex(growth, new Date());
}

/** Game-pass pricing for every genre (Task #89). */
export async function getPassPricing() {
  "use cache";
  cacheLife("hours");
  return getPassPricingIndex();
}

/**
 * The weekly recap's data (Task #92), shared by /weekly and its feed. The
 * clock is read inside so the cache key stays constant (see /trending). Rising
 * games and genres use the /trending rule over 7 days; the spikes' game ids
 * are mapped to universe ids with one small read (≤ WEEKLY_LIMIT ids).
 */
export async function getWeeklyRecap(): Promise<{ data: WeeklyData; now: Date }> {
  "use cache";
  cacheLife("hours");

  const now = new Date();
  const cutoff = new Date(now.getTime() - WEEKLY_DAYS * 86_400_000);
  const [games, genres, entrants, deaths, anomalies] = await Promise.all([
    getRisingGames({ cutoff, limit: WEEKLY_LIMIT }),
    getRisingGenres({ cutoff, limit: WEEKLY_LIMIT }),
    getWeeklyEntrants(cutoff),
    getWeeklyDeaths(cutoff),
    getRecentAnomalies(),
  ]);
  const spikes = weeklySpikes(anomalies?.recent ?? [], now);
  const gameIds = spikes.filter((a) => a.scope === "game").map((a) => a.id);
  const universe = new Map(
    gameIds.length
      ? (
          await prisma.game.findMany({
            where: { id: { in: gameIds } },
            select: { id: true, universeId: true },
          })
        ).map((g) => [g.id, g.universeId.toString()])
      : [],
  );

  return {
    now,
    data: {
      risingGames: games.map((g) => ({
        universeId: g.universeId.toString(),
        name: g.name,
        genreName: g.genreName,
        basePlaying: g.basePlaying,
        currentPlaying: g.currentPlaying,
        growthPct: g.growthPct,
      })),
      risingGenres: genres.map((g) => ({
        slug: g.slug,
        name: g.name,
        basePlaying: g.basePlaying,
        currentPlaying: g.currentPlaying,
        growthPct: g.growthPct,
      })),
      entrants: {
        total: entrants.total,
        games: entrants.games.map((g) => ({
          universeId: g.universeId.toString(),
          name: g.name,
          currentPlaying: g.currentPlaying,
          newOnRoblox: !!g.robloxCreatedAt && g.robloxCreatedAt >= cutoff,
          genreName: g.currentGenre?.name ?? null,
        })),
      },
      deaths: {
        total: deaths.total,
        games: deaths.games.map((g) => ({
          universeId: g.universeId.toString(),
          name: g.name,
          deadSince: g.deadSince,
          allTimePeakPlayers: g.allTimePeakPlayers,
          genreName: g.currentGenre?.name ?? null,
        })),
      },
      spikes: spikes.map((a) => ({
        ...a,
        universeId: a.scope === "game" ? (universe.get(a.id) ?? null) : null,
      })),
    },
  };
}
