/**
 * Write-budget guard (Task #47).
 *
 * In Aug 2026 the collector ran straight into the Turso free plan's monthly
 * row-write cap and everything after that was refused — a permanent hole in
 * history. Before each run the collector now reads the month's measured writes
 * (Task #42's JobRun summaries) and degrades instead of running into the cap:
 *
 *   - normal:  the month-end projection is under REDUCE_AT of the cap;
 *   - reduced: the projection (or the writes so far) passes REDUCE_AT — collect
 *              only busy-tier known games (see cadence.ts), no discovery;
 *   - paused:  the writes so far pass PAUSE_AT — collect nothing, so the
 *              remaining headroom is left for analytics and the site.
 *
 * A guarded run is logged as a `partial` JobRun with the reason, and the guard
 * resets itself when the month (and the budget) turns over.
 */

import type { BudgetReport } from "@/lib/db/write-counts";

export const BUDGET_GUARD = {
  /** Share of the monthly cap at which collection drops to busy-tier games. */
  reduceAt: 0.85,
  /** Share of the monthly cap already used at which collection stops. */
  pauseAt: 0.95,
} as const;

export type BudgetGuardMode = "normal" | "reduced" | "paused";

export interface BudgetGuardDecision {
  mode: BudgetGuardMode;
  cap: number;
  measuredWritesToDate: number;
  /** Month-end estimate, or null before every scheduled job has a measured run. */
  projectedMonthWrites: number | null;
  /** Why the run was reduced/paused; null in normal mode. */
  reason: string | null;
}

const pct = (n: number, cap: number) => `${((n / cap) * 100).toFixed(1)}%`;

/** Pure: decide the guard mode from this month's budget report. */
export function decideBudgetGuard(report: BudgetReport, cap: number): BudgetGuardDecision {
  const toDate = report.measuredWritesToDate;
  const projected = report.projectedMonthWrites;
  const base = { cap, measuredWritesToDate: toDate, projectedMonthWrites: projected };

  if (toDate >= BUDGET_GUARD.pauseAt * cap) {
    return {
      ...base,
      mode: "paused",
      reason:
        `Write-budget guard: ${toDate.toLocaleString("en-US")} rows written this month ` +
        `(${pct(toDate, cap)} of the ${cap.toLocaleString("en-US")} cap) — ` +
        `collection paused until the month resets.`,
    };
  }
  // Before a projection exists (start of month) only the writes so far count.
  const expected = Math.max(toDate, projected ?? 0);
  if (expected >= BUDGET_GUARD.reduceAt * cap) {
    return {
      ...base,
      mode: "reduced",
      reason:
        `Write-budget guard: month-end writes projected at ${expected.toLocaleString("en-US")} ` +
        `(${pct(expected, cap)} of the ${cap.toLocaleString("en-US")} cap, Est.) — ` +
        `collecting busy-tier games only, no discovery.`,
    };
  }
  return { ...base, mode: "normal", reason: null };
}
