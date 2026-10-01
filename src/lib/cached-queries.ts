import { cacheLife } from "next/cache";

import { getGameWindowGrowth, getRisingGames, getRisingGenres } from "@/lib/db/trends";
import { getWeeklyDeaths, getWeeklyEntrants } from "@/lib/db/weekly";
import { getUniverseIds } from "@/lib/db/games";
import { getEngagementIndex } from "@/lib/db/engagement";
import { getConcentrationAll, getRankLadders, getRecentAnomalies } from "@/lib/db/analytics";
import { getPassPricingIndex } from "@/lib/db/pass-pricing";
import { getUpdateCadenceIndex } from "@/lib/db/update-cadence";
import { rangeToCutoff, type RangeKey } from "@/lib/date-range";
import { getSmallIcons } from "@/lib/game-icons";
import { WEEKLY_DAYS, WEEKLY_LIMIT, weeklySpikes, type WeeklyData } from "@/lib/weekly";

// Every loader here is `use cache: remote`: they have one or a few keys and are
// read by many pages, while plain `use cache` is per serverless instance, so
// each cold instance re-ran them against Turso's rows-read quota.

/**
 * Window growth for every rankable game, keyed only by the range so /games and
 * its export share one entry across all filter combinations (Task #70). Same
 * rule as /trending: first-day vs last-day average players, with the baseline
 * floor.
 */
export async function getGrowthRanking(range: RangeKey) {
  "use cache: remote";
  cacheLife("hours");
  const rows = await getGameWindowGrowth(rangeToCutoff(range));
  return rows.map((r) => ({
    id: r.id,
    growthPct: r.growthPct,
    basePlaying: r.basePlaying,
    currentPlaying: r.currentPlaying,
  }));
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
  "use cache: remote";
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
  "use cache: remote";
  cacheLife("hours");
  return getRankLadders();
}

/** Every genre's concentration series (Task #87), as [genreId, series] pairs. */
export async function getConcentrationIndex() {
  "use cache: remote";
  cacheLife("hours");
  return [...(await getConcentrationAll())];
}

/** Update cadence for every genre (Task #88); growth over the same 30 days. */
export async function getUpdateCadence() {
  "use cache: remote";
  cacheLife("hours");
  // The "30d" range is CADENCE.recentDays; update-cadence.test.ts pins that.
  const growth = await getGrowthById("30d");
  return getUpdateCadenceIndex(growth, new Date());
}

/** Game-pass pricing for every genre (Task #89). */
export async function getPassPricing() {
  "use cache: remote";
  cacheLife("hours");
  return getPassPricingIndex();
}

/**
 * The weekly recap's data (Task #92), shared by /weekly and its feed. The
 * clock is read inside so the cache key stays constant (see /trending). Rising
 * games and genres use the /trending rule over 7 days; the spikes' game ids
 * are mapped to universe ids with one small read (≤ WEEKLY_LIMIT ids).
 */
export async function getWeeklyRecap(): Promise<{
  data: WeeklyData;
  now: Date;
  /** Small icons by universe id for the listed games (Task #103). */
  icons: Record<string, string | null>;
}> {
  // Remote (Task #98): few distinct keys, so a cold instance reuses another's entry.
  "use cache: remote";
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
  const universe = await getUniverseIds(spikes.filter((a) => a.scope === "game").map((a) => a.id));
  const listed = new Set<string>([
    ...games.map((g) => String(g.universeId)),
    ...entrants.games.map((g) => String(g.universeId)),
    ...deaths.games.map((g) => String(g.universeId)),
    ...Object.values(universe).map(String),
  ]);
  const icons = Object.fromEntries(await getSmallIcons([...listed]));

  return {
    now,
    icons,
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
        universeId: a.scope === "game" ? (universe[a.id] ?? null) : null,
      })),
    },
  };
}
