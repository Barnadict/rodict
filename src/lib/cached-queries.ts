import { cacheLife } from "next/cache";

import { getGameWindowGrowth } from "@/lib/db/trends";
import { getEngagementIndex } from "@/lib/db/engagement";
import { getConcentrationAll, getRankLadders } from "@/lib/db/analytics";
import { getPassPricingIndex } from "@/lib/db/pass-pricing";
import { getUpdateCadenceIndex } from "@/lib/db/update-cadence";
import { rangeToCutoff, type RangeKey } from "@/lib/date-range";

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
