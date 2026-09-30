/**
 * Launch benchmarks (Task #83): where a game sits among its genre's launches at
 * the same age. The percentiles are precomputed by analytics/launch_benchmark.py;
 * this reads them. Pure, so it's tested without a database.
 */

import type { LaunchBenchmark, LaunchBenchmarkDay } from "@/lib/db/analytics";
import type { DayPoint } from "@/lib/new-releases";

/**
 * Share of the genre's launches (0–1) whose daily average was below `value`,
 * interpolated between the stored percentiles. Clamped to the outermost ones:
 * below the lowest stored percentile reads as that percentile, not 0.
 */
export function shareBelow(value: number, q: number[], quantiles: number[]): number {
  if (value <= q[0]) return quantiles[0] / 100;
  const last = q.length - 1;
  if (value >= q[last]) return quantiles[last] / 100;
  for (let i = 1; i <= last; i++) {
    if (value > q[i]) continue;
    const span = q[i] - q[i - 1];
    // Several percentiles can share one value (lots of games at 0 players).
    const f = span > 0 ? (value - q[i - 1]) / span : 1;
    return (quantiles[i - 1] + f * (quantiles[i] - quantiles[i - 1])) / 100;
  }
  return quantiles[last] / 100;
}

export interface LaunchPosition {
  day: number;
  value: number;
  /** Share of launches below this game on that day, 0–1. */
  shareBelow: number;
  /** True when the game is at or past an outer stored percentile, so the share is a bound. */
  atEdge: "low" | "high" | null;
  nGames: number;
}

/**
 * The game's position on its latest day since launch that has both a reading
 * and a benchmark. Null past the benchmark's last day or with no overlap.
 */
export function launchPosition(
  daily: DayPoint[],
  benchmark: LaunchBenchmark | null,
): LaunchPosition | null {
  if (!benchmark || benchmark.status !== "ok") return null;
  const byDay = new Map<number, LaunchBenchmarkDay>(benchmark.days.map((d) => [d.day, d]));
  const latest = [...daily].sort((a, b) => b.day - a.day);
  for (const point of latest) {
    const bench = byDay.get(point.day);
    if (!bench) continue;
    const share = shareBelow(point.value, bench.q, benchmark.quantiles);
    const lastQ = bench.q.length - 1;
    return {
      day: point.day,
      value: point.value,
      shareBelow: share,
      atEdge: point.value <= bench.q[0] ? "low" : point.value >= bench.q[lastQ] ? "high" : null,
      nGames: bench.n,
    };
  }
  return null;
}

/** "above 82% of Simulator launches" / "in the top 5%…" / "in the bottom 5%…". */
export function describeLaunchPosition(pos: LaunchPosition, genreName: string): string {
  if (pos.atEdge === "high")
    return `in the top ${Math.round((1 - pos.shareBelow) * 100)}% of ${genreName} launches`;
  if (pos.atEdge === "low")
    return `in the bottom ${Math.round(pos.shareBelow * 100)}% of ${genreName} launches`;
  return `above ${Math.round(pos.shareBelow * 100)}% of ${genreName} launches`;
}

export interface BenchmarkBandPoint {
  day: number;
  p25: number;
  median: number;
  p75: number;
  n: number;
}

/** p25 / median / p75 per day, for drawing the band. */
export function benchmarkBand(benchmark: LaunchBenchmark | null): BenchmarkBandPoint[] {
  if (!benchmark || benchmark.status !== "ok") return [];
  const at = (p: number) => benchmark.quantiles.indexOf(p);
  const [i25, i50, i75] = [at(25), at(50), at(75)];
  if (i25 < 0 || i50 < 0 || i75 < 0) return [];
  return benchmark.days.map((d) => ({
    day: d.day,
    p25: d.q[i25],
    median: d.q[i50],
    p75: d.q[i75],
    n: d.n,
  }));
}

const DAY_MS = 86_400_000;

/** Drop days since launch that hadn't ended by the last reading: a part-day
 * average leans on whatever hours it covered. */
export function completeDays(
  daily: DayPoint[],
  createdAt: Date,
  lastReadingAt: number,
): DayPoint[] {
  const lastComplete = Math.floor((lastReadingAt - createdAt.getTime()) / DAY_MS) - 1;
  return daily.filter((p) => p.day <= lastComplete);
}
