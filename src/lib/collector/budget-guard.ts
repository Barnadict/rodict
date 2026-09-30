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
 * Those two are a cliff: full speed until 85%, then little or nothing for the
 * rest of the month. So a scheduled collect run also checks the month's pace
 * (Task #79):
 *
 *   - paced:   the writes so far are ahead of an even line through the month
 *              (cap × WRITE_PACE.margin × share of the month elapsed, plus one
 *              day's share as slack) — skip this run; later runs catch up once
 *              the line has moved past the writes.
 *
 * Skipped runs thin the 3h cron only when the corpus writes faster than the
 * month allows, so collection spreads across the whole month instead of
 * ending early. Pacing is opt-in per caller (the game-pass refresh and manual
 * `collect:prod` runs don't pace).
 *
 * A guarded run is logged as a `partial` JobRun with the reason, and the guard
 * resets itself when the month (and the budget) turns over.
 */

import type { BudgetReport } from "@/lib/db/write-counts";

export const BUDGET_GUARD = {
  /** Share of the monthly cap at which collection drops to busy-tier games. */
  reduceAt: 0.85,
  /** Share of the monthly cap already used at which collection stops. The
   * analytics run skips itself at the same line: keep analytics/budget.py's
   * PAUSE_AT in step (Task #80). */
  pauseAt: 0.95,
} as const;

/** The even-pace line (Task #79). */
export const WRITE_PACE = {
  /** Share of the cap the pace line aims to reach by month end. */
  margin: 0.9,
  /** Slack above the line, in days of the line's per-day allowance. */
  slackDays: 1,
} as const;

export type BudgetGuardMode = "normal" | "reduced" | "paced" | "paused";

export interface BudgetGuardDecision {
  mode: BudgetGuardMode;
  cap: number;
  measuredWritesToDate: number;
  /** Month-end estimate, or null before every scheduled job has a measured run. */
  projectedMonthWrites: number | null;
  /** Writes allowed by now on the even-pace line (Task #79), slack included. */
  paceAllowance: number;
  /** Why the run was reduced/paced/paused; null in normal mode. */
  reason: string | null;
}

export interface BudgetGuardOptions {
  /** Skip the run when ahead of the even-pace line (Task #79). */
  pace?: boolean;
}

/** Pure: writes allowed by this point of the month on the even-pace line. */
export function paceAllowance(report: BudgetReport, cap: number): number {
  const perDay = (cap * WRITE_PACE.margin) / report.daysInMonth;
  return Math.round(perDay * (report.daysElapsed + WRITE_PACE.slackDays));
}

const pct = (n: number, cap: number) => `${((n / cap) * 100).toFixed(1)}%`;

/** Pure: decide the guard mode from this month's budget report. */
export function decideBudgetGuard(
  report: BudgetReport,
  cap: number,
  opts: BudgetGuardOptions = {},
): BudgetGuardDecision {
  const toDate = report.measuredWritesToDate;
  const projected = report.projectedMonthWrites;
  const allowance = paceAllowance(report, cap);
  const base = {
    cap,
    measuredWritesToDate: toDate,
    projectedMonthWrites: projected,
    paceAllowance: allowance,
  };

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
  if (opts.pace && toDate > allowance) {
    return {
      ...base,
      mode: "paced",
      reason:
        `Write-budget pacing: ${toDate.toLocaleString("en-US")} rows written this month, ` +
        `ahead of the ${allowance.toLocaleString("en-US")} allowed by now on an even pace ` +
        `to ${pct(WRITE_PACE.margin * cap, cap)} of the cap — run skipped.`,
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
