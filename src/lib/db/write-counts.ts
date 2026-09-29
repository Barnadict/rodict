/**
 * Row-write accounting (Task #42). The hosted DB is on Turso's free plan, whose
 * monthly rows-written limit is a hard ceiling, and inserts, updates AND deletes
 * all count. Both pipelines tally what they write per table and store it in
 * `JobRun.summary.writes`, so month-to-date usage can be summed from run history
 * (scripts/write-budget.ts) instead of estimated from the code.
 *
 * The Python analytics job writes the same shape (analytics/db.py).
 */

export interface TableWrites {
  inserted: number;
  updated: number;
  deleted: number;
}

/** Per-table write counts for one run, keyed by table name. */
export type WriteCounts = Record<string, TableWrites>;

export function emptyTableWrites(): TableWrites {
  return { inserted: 0, updated: 0, deleted: 0 };
}

/** Add `delta` to `counts[table]` in place (creating the entry if needed). */
export function addWrites(
  counts: WriteCounts,
  table: string,
  delta: Partial<TableWrites>,
): WriteCounts {
  const entry = (counts[table] ??= emptyTableWrites());
  entry.inserted += delta.inserted ?? 0;
  entry.updated += delta.updated ?? 0;
  entry.deleted += delta.deleted ?? 0;
  return counts;
}

/** Merge several runs'/stages' counts into one. */
export function mergeWrites(...parts: WriteCounts[]): WriteCounts {
  const out: WriteCounts = {};
  for (const part of parts) {
    for (const [table, w] of Object.entries(part)) addWrites(out, table, w);
  }
  return out;
}

/** Total rows written (inserts + updates + deletes) across every table. */
export function totalWrites(counts: WriteCounts): number {
  let total = 0;
  for (const w of Object.values(counts)) total += w.inserted + w.updated + w.deleted;
  return total;
}

/**
 * Turso free-plan monthly allowances. Checked on turso.tech/pricing on
 * 2026-09-29 — re-check before relying on them; they are not fetched live.
 */
export const TURSO_FREE_PLAN = {
  checkedOn: "2026-09-29",
  rowsWrittenPerMonth: 10_000_000,
  rowsReadPerMonth: 500_000_000,
  storageBytes: 5 * 1024 ** 3,
} as const;

export interface BudgetRun {
  job: string;
  startedAt: Date;
  /** Parsed `JobRun.summary`, or null. */
  summary: { writesTotal?: number; rowsLoaded?: Record<string, number> } | null;
}

export interface JobBudget {
  runs: number;
  /** Runs whose summary carries a measured `writesTotal` (recorded since #42). */
  measuredRuns: number;
  /** Measured rows written this month, including 1 per run for the JobRun row. */
  measuredWrites: number;
  /** Mean rows written per measured run (JobRun row included), or null. */
  avgWritesPerRun: number | null;
  /** Mean rows loaded per measured analytics run (a rows-read proxy), or null. */
  avgRowsLoadedPerRun: number | null;
}

export interface BudgetReport {
  monthStart: Date;
  daysInMonth: number;
  daysElapsed: number;
  jobs: Record<string, JobBudget>;
  /** Writes measured so far this month. Runs from before #42 aren't included. */
  measuredWritesToDate: number;
  unmeasuredRuns: number;
  /** Month-end estimate = measured so far + remaining days on the given schedule. */
  projectedMonthWrites: number | null;
  /** Rows written per month if the whole month ran on the given schedule. */
  fullMonthWritesAtSchedule: number | null;
  /** Rows read per month by analytics loads alone, at the schedule (Est.). */
  fullMonthAnalyticsReadsAtSchedule: number | null;
}

/**
 * Sum this month's run history into a write-budget report and project it to
 * month end. `runsPerDay` is the schedule to project with (e.g. collect 8/day).
 * Pure so it can be tested without a database.
 */
export function summarizeBudget(
  runs: BudgetRun[],
  now: Date,
  runsPerDay: Record<string, number>,
): BudgetReport {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInMonth = (nextMonth.getTime() - monthStart.getTime()) / 86_400_000;
  const daysElapsed = (now.getTime() - monthStart.getTime()) / 86_400_000;

  const jobs: Record<string, JobBudget> = {};
  const loaded: Record<string, number[]> = {};
  for (const run of runs) {
    if (run.startedAt < monthStart || run.startedAt > now) continue;
    const j = (jobs[run.job] ??= {
      runs: 0,
      measuredRuns: 0,
      measuredWrites: 0,
      avgWritesPerRun: null,
      avgRowsLoadedPerRun: null,
    });
    j.runs++;
    const writes = run.summary?.writesTotal;
    if (typeof writes === "number") {
      j.measuredRuns++;
      j.measuredWrites += writes + 1; // + the JobRun row itself
    }
    const rows = run.summary?.rowsLoaded;
    if (rows) (loaded[run.job] ??= []).push(Object.values(rows).reduce((a, b) => a + b, 0));
  }

  let measuredWritesToDate = 0;
  let unmeasuredRuns = 0;
  for (const [name, j] of Object.entries(jobs)) {
    measuredWritesToDate += j.measuredWrites;
    unmeasuredRuns += j.runs - j.measuredRuns;
    if (j.measuredRuns) j.avgWritesPerRun = j.measuredWrites / j.measuredRuns;
    const l = loaded[name];
    if (l?.length) j.avgRowsLoadedPerRun = l.reduce((a, b) => a + b, 0) / l.length;
  }

  // Per-day cost on the schedule; null if any scheduled job has no measurement yet.
  let perDay: number | null = 0;
  for (const [job, perDayRuns] of Object.entries(runsPerDay)) {
    const avg = jobs[job]?.avgWritesPerRun ?? null;
    if (perDayRuns > 0 && avg === null) perDay = null;
    else if (perDay !== null && avg !== null) perDay += avg * perDayRuns;
  }
  const analyticsLoad = jobs.analytics?.avgRowsLoadedPerRun ?? null;

  return {
    monthStart,
    daysInMonth,
    daysElapsed,
    jobs,
    measuredWritesToDate,
    unmeasuredRuns,
    projectedMonthWrites:
      perDay === null
        ? null
        : Math.round(measuredWritesToDate + perDay * (daysInMonth - daysElapsed)),
    fullMonthWritesAtSchedule: perDay === null ? null : Math.round(perDay * daysInMonth),
    fullMonthAnalyticsReadsAtSchedule:
      analyticsLoad === null
        ? null
        : Math.round(analyticsLoad * (runsPerDay.analytics ?? 0) * daysInMonth),
  };
}
