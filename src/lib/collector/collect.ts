/**
 * The data collector (Task #8). One run:
 *   1. discover universe ids (known games + keyword discovery)   — discover.ts
 *   2. fetch details + votes                                     — Task #6 client
 *   3. validate + dedupe + merge into clean records             — Task #7
 *   4. resolve genre + themes                                    — Task #5
 *   5. persist game + timestamped snapshot + genre/theme history — Task #10
 *
 * Before any of that, the write-budget guard (Task #47, budget-guard.ts) checks
 * the month's measured writes and may reduce the run to busy-tier games or
 * pause it, so collection degrades instead of running into Turso's write cap.
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
import { addWrites, totalWrites, TURSO_FREE_PLAN, type WriteCounts } from "@/lib/db/write-counts";
import { getMonthWriteBudget } from "@/lib/db/write-budget";
import type { JobStatus } from "@/lib/db/job-runs";

import { decideBudgetGuard, type BudgetGuardDecision } from "./budget-guard";
import { discoverUniverseIds, type DiscoverOptions } from "./discover";

export interface CollectionSummary {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  discovered: number;
  /** How many of the newly discovered ids came from the explore-api charts. */
  chartsDiscovered: number;
  knownReCollected: number;
  /** Low-activity known games skipped this run (not yet due, Task #46). */
  deferredLowActivity: number;
  /** Deferred games collected anyway because they were on an explore chart. */
  chartPromoted: number;
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
  /** Rows written per table this run (Task #42), excluding the JobRun row itself. */
  writes: WriteCounts;
  /** The write-budget guard's decision for this run (Task #47); null if skipped. */
  budgetGuard: BudgetGuardDecision | null;
  errors: string[];
}

export interface CollectOptions extends DiscoverOptions {
  /** Optional cap on how many games to persist (for quick test runs). */
  maxGames?: number;
  /** Skip the write-budget guard (Task #47) — a deliberate manual override. */
  ignoreBudget?: boolean;
}

export async function runCollection(opts: CollectOptions = {}): Promise<CollectionSummary> {
  const startedAt = new Date();
  const collectedAt = startedAt; // one timestamp for the whole run
  const errors: string[] = [];

  // Write-budget guard (Task #47). Reads a month of JobRuns — no writes.
  const budgetGuard = opts.ignoreBudget
    ? null
    : decideBudgetGuard(await getMonthWriteBudget(startedAt), TURSO_FREE_PLAN.rowsWrittenPerMonth);
  if (budgetGuard?.mode === "paused") return pausedSummary(startedAt, budgetGuard);
  const reduced = budgetGuard?.mode === "reduced";

  const discovery = await discoverUniverseIds(
    reduced ? { ...opts, knownOnly: true, busyOnly: true, ignoreCadence: false } : opts,
  );
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
  let writes: WriteCounts = {};
  try {
    const result = await persistCollectedGames(toPersist);
    persisted = result.persisted;
    newGames = result.newGames;
    peaksUpdated = result.peaksUpdated;
    genreChanges = result.genreChanges;
    writes = result.writes;
  } catch (err) {
    errors.push(`bulk persist: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Precompute per-genre aggregate snapshots for this run (genre time series).
  let genreSnapshots = 0;
  try {
    genreSnapshots = await persistGenreSnapshots(collectedAt);
    addWrites(writes, "GenreSnapshot", { inserted: genreSnapshots });
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
    deferredLowActivity: discovery.deferredCount,
    chartPromoted: discovery.chartPromotedCount,
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
    writes,
    budgetGuard,
    errors,
  };
}

/** A run the budget guard paused: nothing was fetched or written. */
function pausedSummary(startedAt: Date, budgetGuard: BudgetGuardDecision): CollectionSummary {
  const finishedAt = new Date();
  return {
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    discovered: 0,
    chartsDiscovered: 0,
    knownReCollected: 0,
    deferredLowActivity: 0,
    chartPromoted: 0,
    detailsFetched: 0,
    rejectedDetails: 0,
    rejectedVotes: 0,
    mergeWarnings: 0,
    persisted: 0,
    newGames: 0,
    peaksUpdated: 0,
    genreChanges: 0,
    unresolvedGenre: 0,
    genreSnapshots: 0,
    writes: {},
    budgetGuard,
    errors: [],
  };
}

/** A run with per-game errors, or one the budget guard reduced or paused, is
 * "partial" rather than a clean success, so monitoring can tell them apart. */
export function collectionJobStatus(summary: CollectionSummary): JobStatus {
  const guarded = summary.budgetGuard !== null && summary.budgetGuard.mode !== "normal";
  return summary.errors.length > 0 || guarded ? "partial" : "success";
}

/** The `JobRun.error` text: the budget guard's reason first, then any errors. */
export function collectionJobError(summary: CollectionSummary): string | null {
  const lines = [summary.budgetGuard?.reason, ...summary.errors].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

/** The `JobRun.summary` recorded for a collection run — shared by `npm run
 * collect` and `npm run collect:prod` so both log the same fields. `writes` and
 * `writesTotal` feed the write-budget report (scripts/write-budget.ts). */
export function collectionJobSummary(summary: CollectionSummary) {
  return {
    discovered: summary.discovered,
    chartsDiscovered: summary.chartsDiscovered,
    knownReCollected: summary.knownReCollected,
    deferredLowActivity: summary.deferredLowActivity,
    chartPromoted: summary.chartPromoted,
    persisted: summary.persisted,
    newGames: summary.newGames,
    peaksUpdated: summary.peaksUpdated,
    genreSnapshots: summary.genreSnapshots,
    errorCount: summary.errors.length,
    budgetGuard: summary.budgetGuard?.mode ?? "skipped",
    writes: summary.writes,
    writesTotal: totalWrites(summary.writes),
  };
}
