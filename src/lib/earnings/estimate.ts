/**
 * Earnings ESTIMATION model.
 *
 * Roblox publishes no per-game revenue, and gamepass/dev-product sale counts
 * have been private since July 2020. So we estimate from the public signals we
 * DO collect (concurrent players, visits, visit growth) times a configurable
 * revenue-per-metric assumption, converted Robux->USD via the DevEx rate
 * (devex.ts). Every output is a LABELED RANGE and must be shown as "Est." — it
 * is never a real revenue figure.
 *
 * All the guesswork lives in EARNINGS_ASSUMPTIONS below so it can be tuned in
 * one place. These estimates are computed on-read from stored raw snapshots, so
 * they automatically apply to all history and always reflect the current
 * assumptions/DevEx rate — there is no stored estimate to go stale or backfill.
 */

import { robuxToUsd } from "./devex";

/**
 * Tunable revenue assumptions. These are deliberately rough, genre-agnostic
 * guesses with a wide low..high band; monetization varies enormously by game.
 * They represent estimated GROSS Robux the developer earns (i.e. DevEx-able),
 * not Roblox's platform-wide gross.
 */
export const EARNINGS_ASSUMPTIONS = {
  /** Estimated Robux earned per concurrent player, per day. */
  robuxPerCcuPerDay: { low: 8, mid: 20, high: 45 },
  /** Estimated Robux earned per new visit. */
  robuxPerVisit: { low: 0.05, mid: 0.15, high: 0.4 },
} as const;

export interface EarningsEstimate {
  low: number;
  mid: number;
  high: number;
  currency: "USD";
  /** Which signal produced this estimate. */
  basis: "ccu" | "visit-growth";
  /** Always true — a flag for UI to render the "Est." badge. */
  isEstimate: true;
}

/**
 * Estimated USD/day from concurrent players. The most broadly available signal
 * (present on every snapshot).
 */
export function estimateDailyEarningsFromCcu(
  playing: number,
  date: Date = new Date(),
): EarningsEstimate {
  const a = EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay;
  return {
    low: robuxToUsd(playing * a.low, date),
    mid: robuxToUsd(playing * a.mid, date),
    high: robuxToUsd(playing * a.high, date),
    currency: "USD",
    basis: "ccu",
    isEstimate: true,
  };
}

/**
 * Estimated USD from visit growth over a period. Needs two snapshots'
 * visit counts and the elapsed time. Normalized to a per-day figure.
 */
export function estimateEarningsFromVisitGrowth(
  visitsDelta: number,
  hoursElapsed: number,
  date: Date = new Date(),
): EarningsEstimate | null {
  if (hoursElapsed <= 0 || visitsDelta < 0) return null;
  const perDayFactor = 24 / hoursElapsed;
  const newVisitsPerDay = visitsDelta * perDayFactor;
  const a = EARNINGS_ASSUMPTIONS.robuxPerVisit;
  return {
    low: robuxToUsd(newVisitsPerDay * a.low, date),
    mid: robuxToUsd(newVisitsPerDay * a.mid, date),
    high: robuxToUsd(newVisitsPerDay * a.high, date),
    currency: "USD",
    basis: "visit-growth",
    isEstimate: true,
  };
}

// ---------------------------------------------------------------------------
// Derived-metrics function — everything computable from a raw snapshot.
// ---------------------------------------------------------------------------

/** Minimal snapshot shape the derived-metrics function needs. */
export interface SnapshotLike {
  collectedAt: Date;
  playing: number;
  visits: bigint | number;
  upVotes: number;
  downVotes: number;
}

export interface DerivedMetrics {
  /** upVotes / (upVotes + downVotes), or null with no votes. */
  likeRatio: number | null;
  totalVotes: number;
  /** CCU-based USD/day estimate (labeled). */
  estimatedDailyEarnings: EarningsEstimate;
  /** Visit-growth USD/day estimate vs the previous snapshot, when available. */
  estimatedEarningsFromGrowth: EarningsEstimate | null;
}

/**
 * Compute all derived metrics for a snapshot. Pass the previous snapshot to
 * enable the visit-growth estimate. Pure + works on any stored snapshot.
 */
export function deriveSnapshotMetrics(
  snapshot: SnapshotLike,
  previous?: SnapshotLike,
): DerivedMetrics {
  const totalVotes = snapshot.upVotes + snapshot.downVotes;
  const likeRatio = totalVotes > 0 ? snapshot.upVotes / totalVotes : null;

  let estimatedEarningsFromGrowth: EarningsEstimate | null = null;
  if (previous) {
    const visitsDelta = Number(snapshot.visits) - Number(previous.visits);
    const hoursElapsed =
      (snapshot.collectedAt.getTime() - previous.collectedAt.getTime()) / 3_600_000;
    estimatedEarningsFromGrowth = estimateEarningsFromVisitGrowth(
      visitsDelta,
      hoursElapsed,
      snapshot.collectedAt,
    );
  }

  return {
    likeRatio,
    totalVotes,
    estimatedDailyEarnings: estimateDailyEarningsFromCcu(snapshot.playing, snapshot.collectedAt),
    estimatedEarningsFromGrowth,
  };
}
