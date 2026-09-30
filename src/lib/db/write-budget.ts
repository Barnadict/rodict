import { prisma } from "@/lib/prisma";
import { COLLECTION_CADENCE } from "@/lib/collector/cadence";
import { PASS_WRITE_CAP } from "@/lib/game-passes";

import { fetchTursoUsage } from "./turso-usage";
import { applyTursoUsage, summarizeBudget, type BudgetReport } from "./write-counts";

/**
 * The production pipeline schedule, in runs per day: collect every
 * `runIntervalHours` (collect.yml), analytics twice a day (analytics.yml,
 * Task #45) and the game-pass refresh once a day (gamepasses.yml, Task #69). The write-budget report and the collector's budget guard (#47)
 * both project the month with it.
 */
export const PRODUCTION_SCHEDULE = {
  collect: 24 / COLLECTION_CADENCE.runIntervalHours,
  analytics: 2,
  /** Game-pass refresh, daily (gamepasses.yml, Task #69). */
  gamepasses: 1,
} as const;

/**
 * Worst-case rows per run for a scheduled job before its first measured run
 * (its write cap + the JobRun row), so a new job raises the projection instead
 * of blanking it.
 */
export const UNMEASURED_FALLBACK_WRITES: Record<string, number> = {
  gamepasses: PASS_WRITE_CAP + 1,
};

/**
 * This month's write-budget report, summed from the `JobRun` rows of both
 * pipelines (Task #42). Read-only: one month of JobRuns is a few hundred rows.
 * Against the hosted DB, Turso's own counter is folded in too (Task #81), so
 * writes our jobs don't record still count.
 */
export async function getMonthWriteBudget(
  now: Date,
  runsPerDay: Record<string, number> = PRODUCTION_SCHEDULE,
): Promise<BudgetReport> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // A local dev.db has nothing to do with the hosted org's counter.
  const hosted = !(process.env.DATABASE_URL ?? "file:").startsWith("file:");
  const [rows, turso] = await Promise.all([
    prisma.jobRun.findMany({
      where: { startedAt: { gte: monthStart } },
      select: { job: true, startedAt: true, summary: true },
    }),
    hosted ? fetchTursoUsage() : null,
  ]);
  const report = summarizeBudget(
    rows.map((r) => {
      let summary = null;
      try {
        summary = r.summary ? JSON.parse(r.summary) : null;
      } catch {
        // an unparseable summary just counts as unmeasured
      }
      return { job: r.job, startedAt: r.startedAt, summary };
    }),
    now,
    runsPerDay,
    UNMEASURED_FALLBACK_WRITES,
  );
  return applyTursoUsage(report, turso);
}

/** On-disk size of the database, from SQLite's page count (works on Turso). */
export async function getDatabaseSizeBytes(): Promise<number> {
  const [count] =
    await prisma.$queryRawUnsafe<{ page_count: bigint | number }[]>("PRAGMA page_count");
  const [size] = await prisma.$queryRawUnsafe<{ page_size: bigint | number }[]>("PRAGMA page_size");
  return Number(count.page_count) * Number(size.page_size);
}
