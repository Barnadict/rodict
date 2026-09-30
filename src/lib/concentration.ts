/**
 * Market concentration (Task #87): how much of a genre's players its biggest
 * games hold. The daily shares and HHI are precomputed by
 * analytics/concentration.py; these helpers shape them for the pages. Pure, so
 * they're tested without a database.
 */

import type { ConcentrationDay } from "@/lib/db/analytics";

/**
 * HHI bands from the US merger guidelines (2010): under 0.15 unconcentrated,
 * 0.15–0.25 moderately concentrated, above 0.25 highly concentrated. A common
 * convention, used here only as a label.
 */
export const HHI_BANDS = { moderate: 0.15, high: 0.25 } as const;

export type ConcentrationLevel = "many small games" | "a few leaders" | "a few giants";

export function concentrationLevel(hhi: number): ConcentrationLevel {
  if (hhi > HHI_BANDS.high) return "a few giants";
  if (hhi >= HHI_BANDS.moderate) return "a few leaders";
  return "many small games";
}

/** 1 / HHI: how many equal-sized games would give the same concentration. */
export function effectiveGames(hhi: number): number | null {
  return hhi > 0 ? 1 / hhi : null;
}

/** HHI on the conventional 0–10,000 scale. */
export function hhiPoints(hhi: number): number {
  return Math.round(hhi * 10_000);
}

export interface ConcentrationRow {
  /** ISO timestamp of the UTC day's midnight. */
  date: string;
  top1: number | null;
  top5: number | null;
  top10: number | null;
}

const DAY_MS = 86_400_000;

/**
 * One chart row per UTC day from the first stored day to the last. Days with
 * no data get null values, so the lines break across a collection pause
 * instead of drawing a straight line through it.
 */
export function concentrationRows(days: ConcentrationDay[]): ConcentrationRow[] {
  if (days.length === 0) return [];
  const byDay = new Map(days.map((d) => [d.day, d]));
  const first = Date.parse(`${days[0].day}T00:00:00Z`);
  const last = Date.parse(`${days.at(-1)!.day}T00:00:00Z`);
  const rows: ConcentrationRow[] = [];
  for (let t = first; t <= last; t += DAY_MS) {
    const date = new Date(t).toISOString();
    const d = byDay.get(date.slice(0, 10));
    rows.push({
      date,
      top1: d?.top1 ?? null,
      top5: d?.top5 ?? null,
      top10: d?.top10 ?? null,
    });
  }
  return rows;
}

/** The latest day and the day closest to `daysBack` before it, for a "was" comparison. */
export function latestWithBaseline(
  days: ConcentrationDay[],
  daysBack = 30,
): { latest: ConcentrationDay; baseline: ConcentrationDay | null } | null {
  const latest = days.at(-1);
  if (!latest) return null;
  const target = Date.parse(`${latest.day}T00:00:00Z`) - daysBack * DAY_MS;
  let baseline: ConcentrationDay | null = null;
  for (const d of days) {
    const t = Date.parse(`${d.day}T00:00:00Z`);
    if (t > target) break;
    baseline = d;
  }
  return { latest, baseline };
}
