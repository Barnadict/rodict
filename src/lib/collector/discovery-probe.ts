/**
 * Discovery probe (Task #94, step 1): which discovery sources work from here?
 *
 * Scheduled collect runs are `--known-only` because in July "discovery is
 * throttled to ~nothing on GitHub's datacenter IP" (commit 0d6d4ac). That was
 * measured before #41 added pagination and the explore-api charts, and it
 * lumped every source together. The probe walks each source on its own (each
 * omni-search query, each explore chart) the way discovery does, and records
 * per source: pages fetched, games returned, how many are new to the corpus,
 * and every 429 / other error status seen (retries included).
 *
 * It persists no games. The only write is the probe's own JobRun row.
 */

import { getKnownGamesForCollection } from "@/lib/db/games";
import { getExploreSorts, getExploreSortUniverseIds, searchGames } from "@/lib/roblox/client";
import { RobloxApiError } from "@/lib/roblox/http";

import { DEFAULT_DISCOVERY_QUERIES, SKIP_SORTS } from "./discover";

export interface ProbeSourceResult {
  /** `search:<query>` or `chart:<sortId>`. */
  source: string;
  /** HTTP 200 responses, i.e. pages fetched. */
  pages: number;
  games: number;
  /** Games not yet in the corpus. */
  newGames: number;
  /** 429 responses, retried ones included. */
  http429: number;
  /** Other non-200 responses and network errors (status 0), retries included. */
  otherErrors: number;
  /** The final error if the source gave up, else null. */
  error: string | null;
  ms: number;
}

export interface DiscoveryProbeSummary {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  knownGames: number;
  sources: ProbeSourceResult[];
  /** Distinct new games across every source. */
  newGamesDistinct: number;
  /** Sources that returned games and didn't end in an error. */
  workingSources: number;
  errors: string[];
}

export interface ProbeOptions {
  queries?: string[];
  pagesPerQuery?: number;
  chartPages?: number;
}

/** Walk one source, counting every response it gets. */
async function probeSource(
  source: string,
  known: Set<bigint>,
  newIds: Set<bigint>,
  walk: (opts: { ttlMs: number; onResponse: (s: number) => void }) => Promise<number[]>,
): Promise<ProbeSourceResult> {
  const start = Date.now();
  const r: ProbeSourceResult = {
    source,
    pages: 0,
    games: 0,
    newGames: 0,
    http429: 0,
    otherErrors: 0,
    error: null,
    ms: 0,
  };
  const onResponse = (status: number) => {
    if (status === 200) r.pages++;
    else if (status === 429) r.http429++;
    else r.otherErrors++;
  };
  try {
    // ttlMs 0: a cached page would hide what the API returns right now.
    const ids = await walk({ ttlMs: 0, onResponse });
    r.games = ids.length;
    for (const raw of ids) {
      const id = BigInt(raw);
      if (known.has(id)) continue;
      r.newGames++;
      newIds.add(id);
    }
  } catch (err) {
    r.error =
      err instanceof RobloxApiError
        ? `HTTP ${err.status}`
        : err instanceof Error
          ? err.message
          : String(err);
  }
  r.ms = Date.now() - start;
  return r;
}

export async function runDiscoveryProbe(opts: ProbeOptions = {}): Promise<DiscoveryProbeSummary> {
  const { queries = DEFAULT_DISCOVERY_QUERIES, pagesPerQuery = 10, chartPages = 5 } = opts;
  const startedAt = new Date();
  const errors: string[] = [];
  const { due } = await getKnownGamesForCollection(startedAt, { ignoreCadence: true });
  const known = new Set(due);
  const newIds = new Set<bigint>();

  // One source at a time, so each one's 429s are its own and not a neighbour's.
  const sources: ProbeSourceResult[] = [];
  for (const query of queries) {
    sources.push(
      await probeSource(`search:${query}`, known, newIds, async (o) =>
        (await searchGames(query, { ...o, maxPages: pagesPerQuery })).map((g) => g.universeId),
      ),
    );
  }

  let sortIds: string[] = [];
  const sortsProbe = await probeSource("chart:get-sorts", known, newIds, async (o) => {
    const { sorts } = await getExploreSorts(o);
    sortIds = sorts.map((s) => s.sortId).filter((id) => !SKIP_SORTS.has(id));
    return [];
  });
  sources.push(sortsProbe);
  if (sortsProbe.error) errors.push(`explore get-sorts failed: ${sortsProbe.error}`);
  for (const sortId of sortIds) {
    sources.push(
      await probeSource(`chart:${sortId}`, known, newIds, (o) =>
        getExploreSortUniverseIds(sortId, { ...o, maxPages: chartPages }),
      ),
    );
  }

  const finishedAt = new Date();
  return {
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    knownGames: known.size,
    sources,
    newGamesDistinct: newIds.size,
    workingSources: sources.filter((s) => s.games > 0 && s.error === null).length,
    errors,
  };
}

/** The JobRun summary. `writesTotal: 0` — the probe persists nothing, and the
 * write budget adds its JobRun row (Task #42). */
export function discoveryProbeJobSummary(s: DiscoveryProbeSummary) {
  return {
    knownGames: s.knownGames,
    newGamesDistinct: s.newGamesDistinct,
    workingSources: s.workingSources,
    sourceCount: s.sources.length,
    http429: s.sources.reduce((n, r) => n + r.http429, 0),
    sources: s.sources,
    writes: {},
    writesTotal: 0,
  };
}
