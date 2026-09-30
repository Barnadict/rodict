import { describe, it, expect } from "vitest";

import type { LaunchBenchmark } from "@/lib/db/analytics";
import {
  benchmarkBand,
  completeDays,
  describeLaunchPosition,
  launchPosition,
  shareBelow,
} from "./launch-benchmark";

const QUANTILES = Array.from({ length: 19 }, (_, i) => (i + 1) * 5);
/** p5 = 10, p10 = 20, … p95 = 190. */
const LINEAR_Q = QUANTILES.map((p) => p * 2);

function bench(days: { day: number; q?: number[]; n?: number }[]): LaunchBenchmark {
  return {
    status: "ok",
    nGames: 40,
    maxDay: 90,
    nearLaunchDays: 7,
    minGames: 5,
    quantiles: QUANTILES,
    days: days.map((d) => ({ day: d.day, n: d.n ?? 20, q: d.q ?? LINEAR_Q })),
  };
}

describe("shareBelow", () => {
  it("interpolates between stored percentiles", () => {
    expect(shareBelow(100, LINEAR_Q, QUANTILES)).toBeCloseTo(0.5);
    expect(shareBelow(165, LINEAR_Q, QUANTILES)).toBeCloseTo(0.825);
  });

  it("clamps to the outer percentiles", () => {
    expect(shareBelow(0, LINEAR_Q, QUANTILES)).toBe(0.05);
    expect(shareBelow(10_000, LINEAR_Q, QUANTILES)).toBe(0.95);
  });

  it("handles runs of equal percentiles", () => {
    const q = [0, 0, 0, ...LINEAR_Q.slice(3)];
    expect(shareBelow(0, q, QUANTILES)).toBe(0.05);
    expect(shareBelow(35, q, QUANTILES)).toBeCloseTo(0.19375); // between p15 = 0 and p20 = 40
  });
});

describe("launchPosition", () => {
  it("uses the latest day that has a benchmark", () => {
    const pos = launchPosition(
      [
        { day: 3, value: 50 },
        { day: 14, value: 165 },
        { day: 20, value: 999 },
      ],
      bench([{ day: 3 }, { day: 14, n: 37 }]),
    )!;
    expect(pos.day).toBe(14);
    expect(pos.nGames).toBe(37);
    expect(pos.atEdge).toBeNull();
    expect(describeLaunchPosition(pos, "Simulator")).toBe("above 83% of Simulator launches");
  });

  it("reports the edges as top/bottom shares", () => {
    const high = launchPosition([{ day: 1, value: 500 }], bench([{ day: 1 }]))!;
    expect(describeLaunchPosition(high, "Obby")).toBe("in the top 5% of Obby launches");
    const low = launchPosition([{ day: 1, value: 0 }], bench([{ day: 1 }]))!;
    expect(describeLaunchPosition(low, "Obby")).toBe("in the bottom 5% of Obby launches");
  });

  it("is null without an ok benchmark or an overlapping day", () => {
    expect(launchPosition([{ day: 1, value: 5 }], null)).toBeNull();
    expect(launchPosition([{ day: 1, value: 5 }], bench([{ day: 2 }]))).toBeNull();
    expect(
      launchPosition([{ day: 1, value: 5 }], { ...bench([{ day: 1 }]), status: "insufficient" }),
    ).toBeNull();
  });
});

describe("completeDays", () => {
  it("drops the day still in progress", () => {
    const created = new Date("2026-09-01T00:00:00Z");
    const last = new Date("2026-09-05T06:00:00Z").getTime(); // day 4 in progress
    const days = [0, 3, 4].map((day) => ({ day, value: 1 }));
    expect(completeDays(days, created, last).map((d) => d.day)).toEqual([0, 3]);
  });
});

describe("benchmarkBand", () => {
  it("reads p25/p50/p75", () => {
    expect(benchmarkBand(bench([{ day: 2, n: 9 }]))).toEqual([
      { day: 2, p25: 50, median: 100, p75: 150, n: 9 },
    ]);
    expect(benchmarkBand(null)).toEqual([]);
  });
});
