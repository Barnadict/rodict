import { prisma } from "@/lib/prisma";
import { COLLECTION_CADENCE } from "@/lib/collector/cadence";

import { summarizeBudget, type BudgetReport } from "./write-counts";

/**
 * The production pipeline schedule, in runs per day: collect every
 * `runIntervalHours` (collect.yml) and analytics twice a day (analytics.yml,
 * Task #45). The write-budget report and the collector's budget guard (#47)
 * both project the month with it.
 */
export const PRODUCTION_SCHEDULE = {
  collect: 24 / COLLECTION_CADENCE.runIntervalHours,
  analytics: 2,
} as const;

/**
 * This month's write-budget report, summed from the `JobRun` rows of both
 * pipelines (Task #42). Read-only: one month of JobRuns is a few hundred rows.
 */
export async function getMonthWriteBudget(
  now: Date,
  runsPerDay: Record<string, number> = PRODUCTION_SCHEDULE,
): Promise<BudgetReport> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await prisma.jobRun.findMany({
    where: { startedAt: { gte: monthStart } },
    select: { job: true, startedAt: true, summary: true },
  });
  return summarizeBudget(
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
  );
}

/** On-disk size of the database, from SQLite's page count (works on Turso). */
export async function getDatabaseSizeBytes(): Promise<number> {
  const [count] =
    await prisma.$queryRawUnsafe<{ page_count: bigint | number }[]>("PRAGMA page_count");
  const [size] = await prisma.$queryRawUnsafe<{ page_size: bigint | number }[]>("PRAGMA page_size");
  return Number(count.page_count) * Number(size.page_size);
}
