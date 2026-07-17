/**
 * DevEx (Developer Exchange) rate — the USD value of 1 Robux when cashed out.
 * This is the SINGLE place the rate lives; when Roblox changes it, edit here.
 *
 * Rates change over time, so the schedule is date-aware: an estimate for a
 * historical snapshot uses the rate that was in effect then.
 *
 * Sources / schedule (USD per Robux):
 *   - 0.0035  legacy, before 2025-09-05
 *   - 0.0038  standard, from 2025-09-05
 *   - 0.0054  a separate premium tier for US 18+ in-experience Robux, from
 *             2026-06-08 (NOT the general rate — tracked but not the default)
 */

export type DevExTier = "standard" | "us18Plus";

export interface RateChange {
  /** Effective from this UTC date (inclusive). */
  from: Date;
  usdPerRobux: number;
}

/**
 * Exported so the /about page can publish the real schedule instead of prose
 * that silently drifts from it when a rate changes.
 */
export const DEVEX_SCHEDULES: Record<DevExTier, readonly RateChange[]> = {
  standard: [
    { from: new Date("2000-01-01T00:00:00Z"), usdPerRobux: 0.0035 },
    { from: new Date("2025-09-05T00:00:00Z"), usdPerRobux: 0.0038 },
  ],
  us18Plus: [{ from: new Date("2026-06-08T00:00:00Z"), usdPerRobux: 0.0054 }],
};

/**
 * USD-per-Robux in effect at `date` for the given tier (default: standard,
 * today's rate). Falls back to the earliest rate if `date` predates the tier.
 */
export function getDevExRate(date: Date = new Date(), tier: DevExTier = "standard"): number {
  const schedule = DEVEX_SCHEDULES[tier];
  let rate = schedule[0].usdPerRobux;
  for (const change of schedule) {
    if (date.getTime() >= change.from.getTime()) rate = change.usdPerRobux;
    else break;
  }
  return rate;
}

/** Convert a Robux amount to USD at the DevEx rate effective on `date`. */
export function robuxToUsd(
  robux: number,
  date: Date = new Date(),
  tier: DevExTier = "standard",
): number {
  return robux * getDevExRate(date, tier);
}
