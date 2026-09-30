import { describe, it, expect } from "vitest";

import {
  LIKE_RATIO_MIN_VOTES,
  ageToCreatedRange,
  parseAge,
  parseMinPlayers,
  parseStatus,
  rankByGrowth,
  rankByLikeRatio,
} from "./games-list";

describe("filter parsing", () => {
  it("accepts only known values", () => {
    expect(parseStatus("dead")).toBe("dead");
    expect(parseStatus("zombie")).toBeUndefined();
    expect(parseAge("90d")).toBe("90d");
    expect(parseAge("2d")).toBeUndefined();
    expect(parseMinPlayers("1000")).toBe(1000);
    expect(parseMinPlayers("5")).toBeUndefined();
    expect(parseMinPlayers(undefined)).toBeUndefined();
  });
});

describe("ageToCreatedRange", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  it("bounds recent ages from below and 'older' from above", () => {
    expect(ageToCreatedRange("30d", now)).toEqual({ gte: new Date("2026-08-31T00:00:00Z") });
    expect(ageToCreatedRange("older", now)).toEqual({ lt: new Date("2025-09-30T00:00:00Z") });
  });
});

describe("rankByLikeRatio", () => {
  const row = (id: string, up: number, down: number, playing = 0) => ({
    id,
    currentUpVotes: up,
    currentDownVotes: down,
    currentPlaying: playing,
  });

  it("orders by ratio, leaves out games under the vote floor, and breaks ties by players", () => {
    const rows = [
      row("tiny", 1, 0),
      row("ok", 80, 20),
      row("great", 95, 5, 10),
      row("great-busier", 190, 10, 500),
      row("floor", LIKE_RATIO_MIN_VOTES - 1, 0),
    ];
    expect(rankByLikeRatio(rows, "desc")).toEqual(["great-busier", "great", "ok"]);
    expect(rankByLikeRatio(rows, "asc")).toEqual(["ok", "great-busier", "great"]);
  });
});

describe("rankByGrowth", () => {
  it("orders by growth and leaves out games without a figure", () => {
    const rows = [
      { id: "a", currentPlaying: 100 },
      { id: "b", currentPlaying: 100 },
      { id: "c", currentPlaying: 100 },
    ];
    const growth = new Map([
      ["a", 0.5],
      ["b", -0.2],
    ]);
    expect(rankByGrowth(rows, growth, "desc")).toEqual(["a", "b"]);
    expect(rankByGrowth(rows, growth, "asc")).toEqual(["b", "a"]);
  });
});
