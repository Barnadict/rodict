/**
 * The data collector (Task #8). One run:
 *   1. discover universe ids (known games + keyword discovery)   — discover.ts
 *   2. fetch details + votes                                     — Task #6 client
 *   3. validate + dedupe + merge into clean records             — Task #7
 *   4. resolve genre + themes                                    — Task #5
 *   5. persist game + timestamped snapshot + genre/theme history — Task #10
 *
 * Every game shares one `collectedAt` timestamp so a run is a clean time slice.
 * Per-game failures are caught and tallied so one bad game never aborts the run.
 */

import { getGameDetails, getGameVotes } from "@/lib/roblox/client";
import { sanitizeGameDetails, sanitizeGameVotes, mergeGameData } from "@/lib/validation/sanitize";
import { resolveGameGenre, resolveGameThemes } from "@/lib/taxonomy/genre-mapping";
import { getGenreIdMap } from "@/lib/db/genres";
import { getThemeIdMap } from "@/lib/db/themes";
import { persistCollectedGames, type PersistInput } from "@/lib/db/games";
import { persistGenreSnapshots } from "@/lib/db/genre-snapshots";

import { discoverUniverseIds, type DiscoverOptions } from "./discover";

export interface CollectionSummary {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  discovered: number;
  /** How many of the newly discovered ids came from the explore-api charts. */
  chartsDiscovered: number;
  knownReCollected: number;
  detailsFetched: number;
  rejectedDetails: number;
  rejectedVotes: number;
  mergeWarnings: number;
  persisted: number;
  newGames: number;
  peaksUpdated: number;
  genreChanges: number;
  unresolvedGenre: number;
  genreSnapshots: number;
  errors: string[];
}

export interface CollectOptions extends DiscoverOptions {
  /** Optional cap on how many games to persist (for quick test runs). */
  maxGames?: number;
}

export async function runCollection(opts: CollectOptions = {}): Promise<CollectionSummary> {
  const startedAt = new Date();
  const collectedAt = startedAt; // one timestamp for the whole run
  const errors: string[] = [];

  const discovery = await discoverUniverseIds(opts);
  const universeIds = opts.maxGames
    ? discovery.universeIds.slice(0, opts.maxGames)
    : discovery.universeIds;

  // Fetch raw data (the client batches + rate-limits internally). Details and
  // votes hit the SAME host (games.roblox.com), so they run sequentially rather
  // than in parallel — at thousands of games, doubling the concurrent load on
  // that one host is what tips it into 429s. Each call tolerates per-batch
  // failures and reports how many batches it had to skip.
  const detailsFetch = await getGameDetails(universeIds);
  const votesFetch = await getGameVotes(universeIds);
  const failedBatches = detailsFetch.failedBatches + votesFetch.failedBatches;
  if (failedBatches > 0) {
    errors.push(
      `${failedBatches} API batch(es) skipped after exhausting retries (rate limits); ` +
        `those games were not collected this run and will be retried next run.`,
    );
  }

  const details = sanitizeGameDetails(detailsFetch.data);
  const votes = sanitizeGameVotes(votesFetch.data);
  const { games, warnings } = mergeGameData(details.valid, votes.valid);

  const [genreMap, themeMap] = await Promise.all([getGenreIdMap(), getThemeIdMap()]);

  // Genre/theme resolution is pure and cheap (no IO), so do it for every game in
  // memory first, then hand the whole run to one bulk writer. This is what lets
  // a multi-thousand-game corpus persist within the collector's time budget —
  // the previous per-game transaction loop did not scale (see persistCollectedGames).
  let unresolvedGenre = 0;
  const toPersist: PersistInput[] = [];
  for (const game of games) {
    const resolution = resolveGameGenre({
      universeId: game.universeId,
      name: game.name,
      robloxGenres: game.genreSignals,
    });
    const themeSlugs = resolveGameThemes({
      universeId: game.universeId,
      name: game.name,
      robloxGenres: game.genreSignals,
    });

    const genreId = resolution.genre ? (genreMap.get(resolution.genre) ?? null) : null;
    if (genreId === null) unresolvedGenre++;

    const themeIds = themeSlugs
      .map((slug) => themeMap.get(slug))
      .filter((id): id is string => Boolean(id));

    toPersist.push({ game, collectedAt, genreId, genreSource: resolution.source, themeIds });
  }

  let persisted = 0;
  let newGames = 0;
  let peaksUpdated = 0;
  let genreChanges = 0;
  try {
    const result = await persistCollectedGames(toPersist);
    persisted = result.persisted;
    newGames = result.newGames;
    peaksUpdated = result.peaksUpdated;
    genreChanges = result.genreChanges;
  } catch (err) {
    errors.push(`bulk persist: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Precompute per-genre aggregate snapshots for this run (genre time series).
  let genreSnapshots = 0;
  try {
    genreSnapshots = await persistGenreSnapshots(collectedAt);
  } catch (err) {
    errors.push(`genre snapshots: ${err instanceof Error ? err.message : String(err)}`);
  }

  const finishedAt = new Date();
  return {
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    discovered: discovery.discoveredCount,
    chartsDiscovered: discovery.chartCount,
    knownReCollected: discovery.knownCount,
    detailsFetched: detailsFetch.data.length,
    rejectedDetails: details.rejected.length,
    rejectedVotes: votes.rejected.length,
    mergeWarnings: warnings.length,
    persisted,
    newGames,
    peaksUpdated,
    genreChanges,
    unresolvedGenre,
    genreSnapshots,
    errors,
  };
}
