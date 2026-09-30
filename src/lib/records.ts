/**
 * Records page (Task #84): all-time peaks, the biggest flagged jumps and
 * collapses, fastest launches to a player count, and the longest-lived games
 * still going. Pure, so it's tested without a database.
 */

import type { Anomaly } from "@/lib/db/analytics";

/** Rows per record table. */
export const RECORDS_LIMIT = 15;
/** Player counts the "fastest to" tables measure. */
export const SPEED_THRESHOLDS = [1_000, 10_000] as const;
/** A game must have this many players now to count as still going. */
export const LONGEVITY_MIN_PLAYERS = 100;

const DAY_MS = 86_400_000;

export interface GameMove extends Anomaly {
  gameId: string;
  /** value − prevValue, in players. */
  delta: number;
}

/**
 * The biggest flagged spikes and drops across every game, by players gained or
 * lost in the step (a +2,000% move from 60 players says less than +200K).
 * Payloads that fail to parse are skipped.
 */
export function topMoves(
  rows: { gameId: string; payload: string }[],
  limit = RECORDS_LIMIT,
): { gains: GameMove[]; collapses: GameMove[] } {
  const moves: GameMove[] = [];
  for (const r of rows) {
    let anomalies: Anomaly[];
    try {
      anomalies = (JSON.parse(r.payload) as { anomalies?: Anomaly[] }).anomalies ?? [];
    } catch {
      continue;
    }
    for (const a of anomalies) moves.push({ ...a, gameId: r.gameId, delta: a.value - a.prevValue });
  }
  const gains = moves
    .filter((m) => m.direction === "spike")
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
  const collapses = moves
    .filter((m) => m.direction === "drop")
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);
  return { gains, collapses };
}

export interface SpeedRow {
  id: string;
  createdAt: Date;
  /** First reading at or above the threshold. */
  reachedAt: Date;
  /** The game's first reading of all. */
  firstAt: Date;
}

export interface SpeedRecord<T extends SpeedRow> {
  row: T;
  days: number;
  /** The very first reading was already over the threshold, so `days` is an upper bound. */
  upperBound: boolean;
}

/** Fastest to the threshold after launch, quickest first. */
export function rankSpeed<T extends SpeedRow>(rows: T[], limit = RECORDS_LIMIT): SpeedRecord<T>[] {
  return rows
    .map((row) => ({
      row,
      days: Math.max(0, (row.reachedAt.getTime() - row.createdAt.getTime()) / DAY_MS),
      upperBound: row.reachedAt.getTime() === row.firstAt.getTime(),
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
}

/** "5 h", "3.2 days", "41 days". */
export function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h`;
  if (days < 10) return `${days.toFixed(1)} days`;
  return `${Math.round(days).toLocaleString("en-US")} days`;
}

/** Whole years and months between two dates, e.g. "12 yr 4 mo". */
export function formatAge(from: Date, to: Date): string {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth()) -
    (to.getUTCDate() < from.getUTCDate() ? 1 : 0);
  if (months < 1) return formatDays((to.getTime() - from.getTime()) / DAY_MS);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mo`;
  return m === 0 ? `${y} yr` : `${y} yr ${m} mo`;
}
