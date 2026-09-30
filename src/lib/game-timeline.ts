/**
 * Game timeline (Task #110): one newest-first list of the things we already
 * record about a game — updates (Task #63), flagged spikes and drops (#62/#25),
 * big day-to-day rank moves (#90) and the latest game-pass list change (#69).
 * Nothing new is stored; this only merges and filters. Pure, so it's tested
 * without a database.
 */

import type { Anomaly } from "@/lib/db/analytics";
import type { RankPoint } from "@/lib/rank-history";
import type { UpdateWindowImpact } from "@/lib/update-impact";

/**
 * What counts as a big rank change: the overall rank at least halves or
 * doubles from one ranked day to the next, moves at least `minPlaces`, and the
 * two days are at most `maxGapDays` apart (so a collection pause, like
 * 20 Aug – 29 Sep 2026, isn't read as one sudden move). Ratios, not places,
 * because #20 → #10 is as big a move as #2,000 → #1,000.
 */
export const RANK_CHANGE = { minRatio: 2, minPlaces: 10, maxGapDays: 3 } as const;

/** Newest events shown. */
export const TIMELINE_LIMIT = 30;

const DAY_MS = 86_400_000;

export type TimelineEvent =
  | {
      kind: "update";
      /** ISO timestamp. */
      at: string;
      /** Average players 24h after vs. before, or null when not measurable yet. */
      change24h: number | null;
      pending: boolean;
    }
  | {
      kind: "spike" | "drop";
      at: string;
      from: number;
      to: number;
      changePct: number;
    }
  | {
      kind: "rank";
      /** ISO timestamp of the UTC day's midnight. */
      at: string;
      from: number;
      to: number;
      overallOf: number;
      /** In-genre rank that day. */
      genre: number | null;
    }
  | {
      kind: "passes";
      at: string;
      forSaleCount: number;
      totalRobux: number;
    };

/** Big day-to-day moves in overall rank, oldest first. */
export function bigRankChanges(points: RankPoint[]): Extract<TimelineEvent, { kind: "rank" }>[] {
  const out: Extract<TimelineEvent, { kind: "rank" }>[] = [];
  let prev: RankPoint | null = null;
  for (const p of points) {
    if (p.overall === null) continue;
    if (prev && prev.overall !== null) {
      const gapDays = (Date.parse(p.date) - Date.parse(prev.date)) / DAY_MS;
      const ratio = Math.max(p.overall, prev.overall) / Math.min(p.overall, prev.overall);
      if (
        gapDays <= RANK_CHANGE.maxGapDays &&
        ratio >= RANK_CHANGE.minRatio &&
        Math.abs(p.overall - prev.overall) >= RANK_CHANGE.minPlaces
      ) {
        out.push({
          kind: "rank",
          at: p.date,
          from: prev.overall,
          to: p.overall,
          overallOf: p.overallOf,
          genre: p.genre,
        });
      }
    }
    prev = p;
  }
  return out;
}

export interface TimelineInput {
  updates: { updatedAt: Date; windows: UpdateWindowImpact[] }[];
  anomalies: Anomaly[];
  ranks: RankPoint[];
  passCatalog: { changedAt: Date; forSaleCount: number; totalRobux: number } | null;
}

export interface Timeline {
  events: TimelineEvent[];
  /** Events before the limit was applied. */
  total: number;
}

/** Every event, newest first, cut to `limit`. */
export function buildTimeline(input: TimelineInput, limit = TIMELINE_LIMIT): Timeline {
  const events: TimelineEvent[] = [];
  for (const u of input.updates) {
    const w = u.windows.find((x) => x.hours === 24);
    events.push({
      kind: "update",
      at: u.updatedAt.toISOString(),
      change24h: w?.status === "ok" ? w.changePct : null,
      pending: w?.status === "pending",
    });
  }
  for (const a of input.anomalies) {
    events.push({
      kind: a.direction,
      at: a.at,
      from: a.prevValue,
      to: a.value,
      changePct: a.changePct,
    });
  }
  events.push(...bigRankChanges(input.ranks));
  if (input.passCatalog) {
    events.push({
      kind: "passes",
      at: input.passCatalog.changedAt.toISOString(),
      forSaleCount: input.passCatalog.forSaleCount,
      totalRobux: input.passCatalog.totalRobux,
    });
  }
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { events: events.slice(0, limit), total: events.length };
}
