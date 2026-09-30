import { describe, expect, it } from "vitest";

import { toMarketPoints } from "./market";

describe("toMarketPoints", () => {
  it("converts sums and weights coverage by games", () => {
    // Genre A: 8 of 10 games; genre B: 2 of 2 → 10 of 12.
    const [p] = toMarketPoints([
      {
        collectedAt: "2026-09-30T03:00:00.000Z",
        totalPlaying: BigInt(1500),
        totalGames: BigInt(10),
        classifiedGames: 12,
        missingCoverage: BigInt(0),
      },
    ]);
    expect(p).toEqual({
      date: "2026-09-30T03:00:00.000Z",
      totalPlaying: 1500,
      totalGames: 10,
      coverage: 10 / 12,
    });
  });

  it("leaves coverage unknown when any genre point lacks it", () => {
    const [p] = toMarketPoints([
      {
        collectedAt: "2026-08-01T00:00:00.000Z",
        totalPlaying: 100,
        totalGames: 5,
        classifiedGames: 4,
        missingCoverage: 1,
      },
    ]);
    expect(p.coverage).toBeNull();
  });
});
