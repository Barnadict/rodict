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
import { persistCollectedGame } from "@/lib/db/games";
import { persistGenreSnapshots } from "@/lib/db/genre-snapshots";

import { discoverUniverseIds, type DiscoverOptions } from "./discover";

export interface CollectionSummary {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  discovered: number;
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

  // Fetch raw data (the client batches + rate-limits internally).
  const [rawDetails, rawVotes] = await Promise.all([
    getGameDetails(universeIds),
    getGameVotes(universeIds),
  ]);

  const details = sanitizeGameDetails(rawDetails);
  const votes = sanitizeGameVotes(rawVotes);
  const { games, warnings } = mergeGameData(details.valid, votes.valid);

  const [genreMap, themeMap] = await Promise.all([getGenreIdMap(), getThemeIdMap()]);

  let persisted = 0;
  let newGames = 0;
  let peaksUpdated = 0;
  let genreChanges = 0;
  let unresolvedGenre = 0;

  for (const game of games) {
    try {
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

      const result = await persistCollectedGame({
        game,
        collectedAt,
        genreId,
        genreSource: resolution.source,
        themeIds,
      });

      persisted++;
      if (result.isNew) newGames++;
      if (result.peakUpdated) peaksUpdated++;
      if (result.genreChanged) genreChanges++;
    } catch (err) {
      errors.push(
        `universe ${game.universeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
    knownReCollected: discovery.knownCount,
    detailsFetched: rawDetails.length,
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
