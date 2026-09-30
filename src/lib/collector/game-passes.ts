/**
 * Weekly game-pass refresh (Task #69), run once a day by gamepasses.yml.
 *
 * Each run checks one seventh of the active games (the day's shard, see
 * src/lib/game-passes.ts), fetches their public pass lists, and writes only the
 * catalogs that are new or changed, capped at PASS_WRITE_CAP rows. Anything
 * over the cap waits for the game's next weekly slot.
 *
 * Write cost (Est.): the first week inserts one row per active game (~5.3K
 * total, ~760/day); after that only changed lists are written — Est. a few
 * dozen rows/day. Either way ≤ PASS_WRITE_CAP (+1 JobRun row) per day, i.e.
 * ≤ ~46K/month worst case, under 0.5% of the 10M cap.
 */

import { getGamePasses } from "@/lib/roblox/client";
import { PASS_WRITE_CAP, toPassCatalog, passShardForDay } from "@/lib/game-passes";
import {
  getGamesInPassShard,
  persistPassCatalogs,
  type FetchedCatalog,
} from "@/lib/db/game-passes";
import { totalWrites, TURSO_FREE_PLAN, type WriteCounts } from "@/lib/db/write-counts";
import { getMonthWriteBudget } from "@/lib/db/write-budget";
import type { JobStatus } from "@/lib/db/job-runs";

import { decideBudgetGuard, type BudgetGuardDecision } from "./budget-guard";

export interface PassRefreshSummary {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  shard: number;
  gamesInShard: number;
  fetched: number;
  /** Games whose pass list couldn't be fetched (retried next week). */
  failed: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Changed catalogs left unwritten because the run hit PASS_WRITE_CAP. */
  deferred: number;
  writes: WriteCounts;
  budgetGuard: BudgetGuardDecision | null;
  /** First few fetch errors, for the JobRun row. */
  errors: string[];
}

export interface PassRefreshOptions {
  /** Override the day's shard (manual runs). */
  shard?: number;
  /** Check at most this many games (a quick smoke run). */
  maxGames?: number;
  ignoreBudget?: boolean;
}

export async function runPassRefresh(opts: PassRefreshOptions = {}): Promise<PassRefreshSummary> {
  const startedAt = new Date();
  const shard = opts.shard ?? passShardForDay(startedAt);
  const base = {
    startedAt,
    shard,
    gamesInShard: 0,
    fetched: 0,
    failed: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    deferred: 0,
    writes: {} as WriteCounts,
    errors: [] as string[],
  };
  const finish = (s: typeof base, budgetGuard: BudgetGuardDecision | null): PassRefreshSummary => {
    const finishedAt = new Date();
    return {
      ...s,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      budgetGuard,
    };
  };

  // Pass prices only refine an estimate, so this job yields to collection as
  // soon as the write-budget guard leaves "normal".
  const guard = opts.ignoreBudget
    ? null
    : decideBudgetGuard(await getMonthWriteBudget(startedAt), TURSO_FREE_PLAN.rowsWrittenPerMonth);
  if (guard && guard.mode !== "normal") return finish(base, guard);

  let games = await getGamesInPassShard(shard);
  if (opts.maxGames !== undefined) games = games.slice(0, opts.maxGames);
  base.gamesInShard = games.length;

  // The shared limiter paces these (≤2 in flight, 200ms apart), so firing them
  // all at once still stays well under the endpoint's 50 req/s.
  const results = await Promise.all(
    games.map(async (g): Promise<FetchedCatalog | null> => {
      try {
        return { gameId: g.id, catalog: toPassCatalog(await getGamePasses(g.universeId)) };
      } catch (err) {
        base.failed++;
        if (base.errors.length < 10) {
          base.errors.push(`${g.universeId}: ${err instanceof Error ? err.message : String(err)}`);
        }
        return null;
      }
    }),
  );
  const fetched = results.filter((r): r is FetchedCatalog => r !== null);
  base.fetched = fetched.length;

  const persisted = await persistPassCatalogs(fetched, new Date(), PASS_WRITE_CAP);
  Object.assign(base, {
    inserted: persisted.inserted,
    updated: persisted.updated,
    unchanged: persisted.unchanged,
    deferred: persisted.deferred,
    writes: persisted.writes,
  });
  return finish(base, guard);
}

/** Failed fetches, a hit cap, or a guarded skip make the run "partial". */
export function passRefreshStatus(s: PassRefreshSummary): JobStatus {
  if (s.gamesInShard > 0 && s.fetched === 0) return "failure";
  if (s.failed > 0 || s.deferred > 0 || (s.budgetGuard && s.budgetGuard.mode !== "normal")) {
    return "partial";
  }
  return "success";
}

/** The JobRun summary: counts plus `writesTotal` for the write budget (#42). */
export function passRefreshJobSummary(s: PassRefreshSummary) {
  return {
    shard: s.shard,
    gamesInShard: s.gamesInShard,
    fetched: s.fetched,
    failed: s.failed,
    inserted: s.inserted,
    updated: s.updated,
    unchanged: s.unchanged,
    deferred: s.deferred,
    writes: s.writes,
    writesTotal: totalWrites(s.writes),
    budgetGuard: s.budgetGuard,
  };
}

export function passRefreshJobError(s: PassRefreshSummary): string | null {
  const parts: string[] = [];
  if (s.budgetGuard?.reason) parts.push(`Skipped: ${s.budgetGuard.reason}`);
  if (s.deferred > 0) parts.push(`${s.deferred} changed catalog(s) over the write cap.`);
  if (s.failed > 0) parts.push(`${s.failed} fetch failure(s):\n${s.errors.join("\n")}`);
  return parts.length ? parts.join("\n") : null;
}
