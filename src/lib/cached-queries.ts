import { cacheLife } from "next/cache";

import { getGameWindowGrowth } from "@/lib/db/trends";
import { getEngagementIndex } from "@/lib/db/engagement";
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
