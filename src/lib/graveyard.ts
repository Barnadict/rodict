/**
 * Game graveyard (Task #85): games that are dead by our rule now, with how
 * long they lived and how fast they fell. Pure, so it's tested without a
 * database.
 */

import { median } from "@/lib/theme-matrix";

/** Most graves listed at once. */
export const GRAVEYARD_LIMIT = 100;

export const GRAVE_SORTS = [
  { value: "recent", label: "Most recent" },
  { value: "peak", label: "Biggest peak" },
  { value: "lifespan", label: "Longest life" },
  { value: "fall", label: "Fastest fall" },
] as const;
export type GraveSort = (typeof GRAVE_SORTS)[number]["value"];

export function parseGraveSort(raw: string | undefined): GraveSort {
  return GRAVE_SORTS.find((s) => s.value === raw)?.value ?? "recent";
}

const DAY_MS = 86_400_000;

export interface GraveInput {
  deadSince: Date;
  robloxCreatedAt: Date | null;
  allTimePeakAt: Date | null;
  allTimePeakPlayers: number;
}

export interface GraveStats {
  /** Roblox creation → death, in days; null without a creation date. */
  lifespanDays: number | null;
  /** All-time peak → death, in days; null without a peak time. */
  peakToDeathDays: number | null;
}

export function graveStats(g: GraveInput): GraveStats {
  const days = (from: Date | null) =>
    from ? Math.max(0, (g.deadSince.getTime() - from.getTime()) / DAY_MS) : null;
  return { lifespanDays: days(g.robloxCreatedAt), peakToDeathDays: days(g.allTimePeakAt) };
}

/** Sorted graves; unknown values sort last. "Fastest fall" is the shortest peak → death. */
export function sortGraves<T extends GraveInput & GraveStats>(rows: T[], sort: GraveSort): T[] {
  const key = (r: T): number | null => {
    switch (sort) {
      case "recent":
        return -r.deadSince.getTime();
      case "peak":
        return -r.allTimePeakPlayers;
      case "lifespan":
        return r.lifespanDays === null ? null : -r.lifespanDays;
      case "fall":
        return r.peakToDeathDays;
    }
  };
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null || kb === null) return ka === null ? (kb === null ? 0 : 1) : -1;
    return ka - kb || b.allTimePeakPlayers - a.allTimePeakPlayers;
  });
}

export interface GraveSummary {
  count: number;
  medianLifespanDays: number | null;
  medianPeakToDeathDays: number | null;
}

export function summarizeGraves(rows: GraveStats[]): GraveSummary {
  const known = (vals: (number | null)[]) => vals.filter((v): v is number => v !== null);
  const life = known(rows.map((r) => r.lifespanDays));
  const fall = known(rows.map((r) => r.peakToDeathDays));
  return {
    count: rows.length,
    medianLifespanDays: life.length ? median(life) : null,
    medianPeakToDeathDays: fall.length ? median(fall) : null,
  };
}
