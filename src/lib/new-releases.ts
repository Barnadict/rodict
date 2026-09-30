/**
 * New-releases tracker (Task #66): games created on Roblox or first tracked in
 * the last NEW_RELEASE_DAYS, their recent change, and an early curve (players by
 * days since launch) drawn over the same genre's games at the same ages. Pure,
 * so it's tested without a database.
 */

import { median } from "@/lib/theme-matrix";

export const NEW_RELEASE_DAYS = 30;
/** Most-played new games listed (and the only ones read). */
export const NEW_RELEASES_LIMIT = 100;
/** The early curve and genre band cover days 0…this since launch. */
export const EARLY_CURVE_DAYS = 30;
/** A genre day is drawn only when at least this many games have a reading. */
export const LIFECYCLE_MIN_GAMES = 3;

const DAY_MS = 86_400_000;

export type ReleaseKind = "new-on-roblox" | "newly-tracked";

/**
 * "New on Roblox" when created within the window; otherwise the game only
 * entered our data recently (discovery found an older game), which says nothing
 * about its age.
 */
export function releaseKind(robloxCreatedAt: Date | null, cutoff: Date): ReleaseKind {
  return robloxCreatedAt && robloxCreatedAt >= cutoff ? "new-on-roblox" : "newly-tracked";
}

export interface Reading {
  t: number;
  playing: number;
}

export interface DayPoint {
  day: number;
  value: number;
}

/**
 * Daily average players by whole days since launch. Averaging per day first
 * keeps a busy game's 8 readings a day from outweighing a quiet game's one.
 */
export function dailyByAge(readings: Reading[], createdAt: Date, maxDays: number): DayPoint[] {
  const start = createdAt.getTime();
  const days = new Map<number, { sum: number; n: number }>();
  for (const r of readings) {
    const day = Math.floor((r.t - start) / DAY_MS);
    if (day < 0 || day > maxDays) continue;
    const d = days.get(day) ?? { sum: 0, n: 0 };
    d.sum += r.playing;
    d.n++;
    days.set(day, d);
  }
  return [...days].map(([day, d]) => ({ day, value: d.sum / d.n })).sort((a, b) => a.day - b.day);
}

export interface LifecycleBandPoint {
  day: number;
  median: number;
  p25: number;
  p75: number;
  nGames: number;
}

/** Linear-interpolated quantile of an ascending, non-empty array (q in 0–1). */
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * The genre's typical early curve: for each day since launch, the median and
 * middle half of its games' daily averages. Median, not mean, so one breakout
 * hit doesn't become "the genre average". Days with too few games are dropped.
 */
export function summarizeLifecycle(
  rows: { gameId: string; day: number; avg: number }[],
  minGames = LIFECYCLE_MIN_GAMES,
): LifecycleBandPoint[] {
  const byDay = new Map<number, number[]>();
  for (const r of rows) {
    const list = byDay.get(r.day) ?? [];
    list.push(r.avg);
    byDay.set(r.day, list);
  }
  return [...byDay]
    .filter(([, v]) => v.length >= minGames)
    .map(([day, v]) => {
      const sorted = [...v].sort((a, b) => a - b);
      return {
        day,
        median: median(sorted),
        p25: quantile(sorted, 0.25),
        p75: quantile(sorted, 0.75),
        nGames: v.length,
      };
    })
    .sort((a, b) => a.day - b.day);
}

export interface RecentChange {
  base: number;
  current: number;
  pct: number | null;
}

/**
 * Change over the last week: average players in the 24h up to the game's latest
 * reading vs. the 24h a week before that. Comparing the same time of day, and
 * averages rather than single readings, as /trending does (Task #53). Null
 * without a reading in both windows.
 */
export function weekOverWeek(readings: Reading[]): RecentChange | null {
  if (readings.length < 2) return null;
  const last = Math.max(...readings.map((r) => r.t));
  const avg = (from: number, to: number) => {
    const inWin = readings.filter((r) => r.t > from && r.t <= to);
    return inWin.length ? inWin.reduce((s, r) => s + r.playing, 0) / inWin.length : null;
  };
  const current = avg(last - DAY_MS, last);
  const base = avg(last - 8 * DAY_MS, last - 7 * DAY_MS);
  if (current === null || base === null) return null;
  return { base, current, pct: base > 0 ? (current - base) / base : null };
}

export type NewReleaseSort = "players" | "growth";

export function parseNewReleaseSort(raw: string | undefined): NewReleaseSort {
  return raw === "growth" ? "growth" : "players";
}

/** Sort by current players, or by weekly change with unmeasured games last. */
export function sortNewReleases<T extends { currentPlaying: number; change: RecentChange | null }>(
  rows: T[],
  sort: NewReleaseSort,
): T[] {
  const out = [...rows];
  if (sort === "players") return out.sort((a, b) => b.currentPlaying - a.currentPlaying);
  return out.sort((a, b) => {
    const pa = a.change?.pct ?? null;
    const pb = b.change?.pct ?? null;
    if (pa === null && pb === null) return b.currentPlaying - a.currentPlaying;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pb - pa;
  });
}
