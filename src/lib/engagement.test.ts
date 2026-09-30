import { describe, it, expect } from "vitest";

import {
  SESSION_ESTIMATE,
  addSessionSums,
  favoritesPer1kVisits,
  formatSessionMinutes,
  likeRatioTrend,
  rankBySession,
  sessionMinutes,
  sumSessionPairs,
} from "./engagement";

const H = 3_600_000;

/** Readings every `stepH` hours with steady players and visits per hour. */
function steady(n: number, stepH: number, playing: number, visitsPerHour: number) {
  return Array.from({ length: n }, (_, i) => ({
    t: i * stepH * H,
    playing,
    visits: 1_000_000 + i * stepH * visitsPerHour,
  }));
}

describe("sumSessionPairs / sessionMinutes", () => {
  it("recovers the stay time of a steady game (Little's law)", () => {
    // 1,000 players, 2,000 joins an hour → each stays half an hour.
    const sums = sumSessionPairs(steady(9, 3, 1000, 2000));
    expect(sums.hours).toBe(24);
    expect(sessionMinutes(sums)).toBeCloseTo(30);
  });

  it("uses the trapezoid for players between readings", () => {
    const sums = sumSessionPairs([
      { t: 0, playing: 100, visits: 0 },
      { t: 2 * H, playing: 300, visits: 400 },
    ]);
    expect(sums).toEqual({ playerHours: 400, visits: 400, hours: 2 });
  });

  it("skips pairs too close, too far apart, or with a falling counter", () => {
    const sums = sumSessionPairs([
      { t: 0, playing: 100, visits: 1000 },
      { t: 0.5 * H, playing: 100, visits: 1100 }, // < minGapHours
      { t: 20 * H, playing: 100, visits: 5000 }, // > maxGapHours
      { t: 23 * H, playing: 100, visits: 4000 }, // counter went back
      { t: 26 * H, playing: 100, visits: 4600 }, // counted
    ]);
    expect(sums).toEqual({ playerHours: 300, visits: 600, hours: 3 });
  });

  it("sorts readings first", () => {
    const rows = steady(5, 3, 500, 1000);
    expect(sumSessionPairs([...rows].reverse())).toEqual(sumSessionPairs(rows));
  });

  it("gives no estimate without enough hours or visits", () => {
    expect(sessionMinutes(sumSessionPairs(steady(4, 3, 1000, 2000)))).toBeNull(); // 9h
    const quiet = sumSessionPairs(steady(9, 3, 5, 10)); // 240 visits
    expect(quiet.hours).toBeGreaterThanOrEqual(SESSION_ESTIMATE.minCoveredHours);
    expect(sessionMinutes(quiet)).toBeNull();
  });

  it("pools sums so the busier game weighs more", () => {
    const a = sumSessionPairs(steady(9, 3, 1000, 2000)); // 30 min
    const b = sumSessionPairs(steady(9, 3, 100, 100)); // 60 min
    const pooled = sessionMinutes(addSessionSums(a, b))!;
    expect(pooled).toBeGreaterThan(30);
    expect(pooled).toBeLessThan(35);
  });
});

describe("formatSessionMinutes", () => {
  it("switches to hours past 90 minutes", () => {
    expect(formatSessionMinutes(null)).toBe("—");
    expect(formatSessionMinutes(0.4)).toBe("<1 min");
    expect(formatSessionMinutes(42.4)).toBe("42 min");
    expect(formatSessionMinutes(150)).toBe("2.5 h");
  });
});

describe("favoritesPer1kVisits", () => {
  it("needs enough visits", () => {
    expect(favoritesPer1kVisits(5, 999)).toBeNull();
    expect(favoritesPer1kVisits(25, BigInt(10_000))).toBe(2.5);
  });
});

describe("likeRatioTrend", () => {
  it("compares the first and last readings with enough votes", () => {
    const trend = likeRatioTrend(
      [
        { t: 3, upVotes: 90, downVotes: 10 }, // 0.90
        { t: 1, upVotes: 1, downVotes: 0 }, // under the floor
        { t: 2, upVotes: 80, downVotes: 20 }, // 0.80
      ],
      100,
    );
    expect(trend).toBeCloseTo(0.1);
  });

  it("is null with fewer than two rated readings", () => {
    expect(likeRatioTrend([{ t: 1, upVotes: 90, downVotes: 10 }], 100)).toBeNull();
  });
});

describe("rankBySession", () => {
  it("ranks games with an estimate, ties to the busier game", () => {
    const rows = [
      { id: "a", currentPlaying: 10 },
      { id: "b", currentPlaying: 50 },
      { id: "c", currentPlaying: 99 },
      { id: "d", currentPlaying: 5 },
    ];
    const minutes = new Map([
      ["a", 30],
      ["b", 30],
      ["d", 60],
    ]);
    expect(rankBySession(rows, minutes, "desc")).toEqual(["d", "b", "a"]);
    expect(rankBySession(rows, minutes, "asc")).toEqual(["b", "a", "d"]);
  });
});
