/**
 * Discovery: decide which universe ids to collect this run.
 *
 * Survivorship-bias guard (locked decision): we ALWAYS re-collect every game
 * already in the DB, so once a game enters the dataset we keep following it as
 * it declines and eventually dies — dead games never fall out. On top of that
 * we discover new games two ways:
 *
 *   1. keyword search across the genre space (omni-search), walked several
 *      pages deep — one page is only ~40 games, and the tail (hundreds per
 *      query) only appears if you follow the page token.
 *   2. the explore-api charts (Top Playing Now, Up-and-Coming, ...). These are
 *      the real Roblox "charts"; Up-and-Coming in particular surfaces games
 *      near launch, which keyword search misses and which the survival stats
 *      most want (a game we catch young, we can watch live and die).
 *
 * Discovery is a wide, tunable net. Its width is what makes the corpus large;
 * the follow-known mechanism is what keeps the survival statistics honest.
 *
 * Known games are followed on a tiered cadence (Task #46, see cadence.ts):
 * low-activity games not yet due are skipped even when keyword search returns
 * them (search re-finds most of the corpus, which would otherwise undo the
 * tiering on every discovery run). A deferred game that appears on an explore
 * CHART is still collected: being charted is itself a sign it's active.
 */

import { searchGames, getExploreSorts, getExploreSortUniverseIds } from "@/lib/roblox/client";

import { getKnownGamesForCollection } from "@/lib/db/games";

export const DEFAULT_DISCOVERY_QUERIES = [
  "simulator",
  "tycoon",
  "obby",
  "rpg",
  "roleplay",
  "tower defense",
  "fighting",
  "shooter",
  "horror",
  "adventure",
  "survival",
  "racing",
  "clicker",
  "anime",
  "story",
  "escape",
  "pet",
  "city",
  "battle",
  "build",
];

// `filters_v5` is a filter UI descriptor, not a game list — it returns no games
// and must be skipped when walking the charts.
const SKIP_SORTS = new Set(["filters_v5"]);

export interface DiscoverOptions {
  /** Search queries to fan out over. Defaults to DEFAULT_DISCOVERY_QUERIES. */
  queries?: string[];
  /** How many omni-search pages to walk per query (~40 games/page). Default 10;
   *  most queries dry up (return an empty page) before then and stop early. */
  pagesPerQuery?: number;
  /** How many pages to walk per explore-api chart. Default 5. */
  chartPages?: number;
  /** Skip the explore-api charts and only use keyword search. */
  skipCharts?: boolean;
  /** Skip ALL discovery and only re-collect known games. */
  knownOnly?: boolean;
  /** Collect every known game regardless of its cadence tier. */
  ignoreCadence?: boolean;
  /** Collect only busy-tier known games (the write-budget guard, Task #47). */
  busyOnly?: boolean;
}

export interface DiscoverResult {
  universeIds: bigint[];
  /** Known games due this run. */
  knownCount: number;
  /** Known low-activity games skipped this run (not yet due). */
  deferredCount: number;
  /** Deferred games collected anyway because they appeared on an explore chart. */
  chartPromotedCount: number;
  discoveredCount: number;
  /** How many of the discovered ids came from the explore-api charts. */
  chartCount: number;
}

export async function discoverUniverseIds(opts: DiscoverOptions = {}): Promise<DiscoverResult> {
  const {
    queries = DEFAULT_DISCOVERY_QUERIES,
    pagesPerQuery = 10,
    chartPages = 5,
    skipCharts,
    knownOnly,
    ignoreCadence,
    busyOnly,
  } = opts;

  const { due, deferred } = await getKnownGamesForCollection(new Date(), {
    ignoreCadence,
    busyOnly,
  });
  const all = new Set<bigint>(due);
  let discoveredCount = 0;
  let chartCount = 0;
  let chartPromotedCount = 0;

  /** Add an id to this run; true if it's a brand-new game. Deferred known
   * games are only added when `promote` (i.e. seen on a chart). */
  const add = (rawId: number, promote = false): boolean => {
    const id = BigInt(rawId);
    if (deferred.has(id)) {
      if (promote && !all.has(id)) {
        all.add(id);
        chartPromotedCount++;
      }
      return false;
    }
    const isNew = !all.has(id);
    all.add(id);
    return isNew;
  };

  if (!knownOnly) {
    // 1. Keyword search, several pages deep, all queries in parallel. A single
    //    failed query (or failed page) must not abort the rest.
    const searches = await Promise.all(
      queries.map(async (query) => {
        try {
          return await searchGames(query, { maxPages: pagesPerQuery });
        } catch {
          return [];
        }
      }),
    );
    for (const games of searches) {
      for (const g of games) if (add(g.universeId)) discoveredCount++;
    }

    // 2. The explore-api charts.
    if (!skipCharts) {
      try {
        const { sorts } = await getExploreSorts();
        const chartResults = await Promise.all(
          sorts
            .filter((s) => !SKIP_SORTS.has(s.sortId))
            .map(async (s) => {
              try {
                return await getExploreSortUniverseIds(s.sortId, { maxPages: chartPages });
              } catch {
                return [];
              }
            }),
        );
        for (const ids of chartResults) {
          for (const rawId of ids) {
            if (add(rawId, true)) {
              discoveredCount++;
              chartCount++;
            }
          }
        }
      } catch {
        // The whole charts step is best-effort; keyword discovery already ran.
      }
    }
  }

  return {
    universeIds: [...all],
    knownCount: due.length,
    deferredCount: deferred.size - chartPromotedCount,
    chartPromotedCount,
    discoveredCount,
    chartCount,
  };
}
