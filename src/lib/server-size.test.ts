import { describe, expect, it } from "vitest";

import {
  SERVER_SIZE,
  averageRanks,
  serverSizeByGenre,
  spearman,
  summarizeServerSize,
} from "@/lib/server-size";

describe("spearman", () => {
  it("gives tied values their average rank", () => {
    expect(averageRanks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
  });

  it("is 1 for a monotonic relation and -1 for a reversed one", () => {
    expect(spearman([1, 2, 3, 4], [10, 100, 1000, 10_000])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });

  it("is null when one side is constant", () => {
    expect(spearman([8, 8, 8], [1, 2, 3])).toBeNull();
  });
});

describe("summarizeServerSize", () => {
  it("summarizes sizes, busy games and the correlation", () => {
    const games = Array.from({ length: SERVER_SIZE.minCorrelationGames }, (_, i) => ({
      genreId: "sim",
      maxPlayers: 10 + i,
      playing: (i + 1) * 30,
    }));
    const s = summarizeServerSize(games);
    expect(s.games).toBe(10);
    expect(s.median).toBe(14.5);
    expect(s.busyGames).toBe(7); // 120+ … 300 players
    expect(s.medianBusy).toBe(16);
    expect(s.spearman).toBeCloseTo(1);
  });

  it("needs enough games with players for a correlation", () => {
    const s = summarizeServerSize([
      { genreId: "sim", maxPlayers: 10, playing: 5 },
      { genreId: "sim", maxPlayers: 20, playing: 0 },
    ]);
    expect(s.spearman).toBeNull();
    expect(s.spearmanGames).toBe(1);
    expect(s.medianBusy).toBeNull();
  });

  it("groups by genre and drops unclassified games", () => {
    const by = serverSizeByGenre([
      { genreId: "sim", maxPlayers: 10, playing: 1 },
      { genreId: null, maxPlayers: 50, playing: 1 },
    ]);
    expect(Object.keys(by)).toEqual(["sim"]);
  });
});
