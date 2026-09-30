import { describe, it, expect } from "vitest";

import { formatAge, formatDays, rankSpeed, topMoves } from "./records";

const anomaly = (value: number, prevValue: number, at = "2026-09-29T00:00:00.000Z") => ({
  at,
  value,
  prevValue,
  changePct: value / prevValue - 1,
  direction: value > prevValue ? ("spike" as const) : ("drop" as const),
  score: 6,
});

describe("topMoves", () => {
  it("ranks spikes and drops by players moved, across games", () => {
    const rows = [
      {
        gameId: "a",
        payload: JSON.stringify({ anomalies: [anomaly(120, 60), anomaly(5000, 9000)] }),
      },
      { gameId: "b", payload: JSON.stringify({ anomalies: [anomaly(300_000, 200_000)] }) },
      { gameId: "c", payload: "not json" },
      { gameId: "d", payload: JSON.stringify({}) },
    ];
    const { gains, collapses } = topMoves(rows);
    expect(gains.map((m) => [m.gameId, m.delta])).toEqual([
      ["b", 100_000],
      ["a", 60],
    ]);
    expect(collapses.map((m) => [m.gameId, m.delta])).toEqual([["a", -4000]]);
  });

  it("caps each list", () => {
    const anomalies = Array.from({ length: 5 }, (_, i) => anomaly(100 + i * 10, 50));
    const { gains } = topMoves([{ gameId: "a", payload: JSON.stringify({ anomalies }) }], 2);
    expect(gains.map((m) => m.value)).toEqual([140, 130]);
  });
});

describe("rankSpeed", () => {
  const created = new Date("2026-09-01T00:00:00Z");
  const at = (days: number) => new Date(created.getTime() + days * 86_400_000);
  it("orders by time to the mark and flags a first reading already over it", () => {
    const ranked = rankSpeed([
      { id: "slow", createdAt: created, firstAt: at(1), reachedAt: at(9) },
      { id: "fast", createdAt: created, firstAt: at(0.5), reachedAt: at(2) },
      { id: "found", createdAt: created, firstAt: at(3), reachedAt: at(3) },
    ]);
    expect(ranked.map((r) => [r.row.id, r.days, r.upperBound])).toEqual([
      ["fast", 2, false],
      ["found", 3, true],
      ["slow", 9, false],
    ]);
  });
});

describe("formatDays / formatAge", () => {
  it("formats durations", () => {
    expect(formatDays(0.2)).toBe("5 h");
    expect(formatDays(3.25)).toBe("3.3 days");
    expect(formatDays(41.4)).toBe("41 days");
  });

  it("formats ages in years and months", () => {
    const to = new Date("2026-09-30T00:00:00Z");
    expect(formatAge(new Date("2014-05-10T00:00:00Z"), to)).toBe("12 yr 4 mo");
    expect(formatAge(new Date("2025-09-30T00:00:00Z"), to)).toBe("1 yr");
    expect(formatAge(new Date("2026-07-31T00:00:00Z"), to)).toBe("1 mo");
    expect(formatAge(new Date("2026-09-20T00:00:00Z"), to)).toBe("10 days");
  });
});
