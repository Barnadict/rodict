/**
 * Discovery: decide which universe ids to collect this run.
 *
 * Survivorship-bias guard (locked decision): we ALWAYS re-collect every game
 * already in the DB, so once a game enters the dataset we keep following it as
 * it declines and eventually dies — dead games never fall out. On top of that
 * we discover new games via keyword search across the genre space.
 *
 * The search list is a broad, tunable net rather than a true "charts / new near
 * launch" feed (that needs Roblox's session-based charts API and can be layered
 * on later). The follow-known mechanism is the part that actually protects the
 * survival statistics.
 */

import { searchGames } from "@/lib/roblox/client";

import { getKnownUniverseIds } from "@/lib/db/games";

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

export interface DiscoverOptions {
  /** Search queries to fan out over. Defaults to DEFAULT_DISCOVERY_QUERIES. */
  queries?: string[];
  /** Max results to take per query. Default 20. */
  perQuery?: number;
  /** Skip keyword discovery and only re-collect known games. */
  knownOnly?: boolean;
}

export interface DiscoverResult {
  universeIds: bigint[];
  knownCount: number;
  discoveredCount: number;
}

export async function discoverUniverseIds(opts: DiscoverOptions = {}): Promise<DiscoverResult> {
  const { queries = DEFAULT_DISCOVERY_QUERIES, perQuery = 20, knownOnly } = opts;

  const known = await getKnownUniverseIds();
  const all = new Set<bigint>(known);
  let discoveredCount = 0;

  if (!knownOnly) {
    for (const query of queries) {
      try {
        const games = await searchGames(query, { limit: perQuery });
        for (const g of games) {
          const id = BigInt(g.universeId);
          if (!all.has(id)) discoveredCount++;
          all.add(id);
        }
      } catch {
        // A single failed search query shouldn't abort discovery.
      }
    }
  }

  return {
    universeIds: [...all],
    knownCount: known.length,
    discoveredCount,
  };
}
