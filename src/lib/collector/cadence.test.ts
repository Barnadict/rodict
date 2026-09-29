import { describe, expect, it } from "vitest";

import {
  COLLECTION_CADENCE,
  collectionTier,
  isDueForCollection,
  type CadenceGame,
} from "./cadence";

const NOW = new Date("2026-10-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysAgo = (d: number) => hoursAgo(d * 24);

function game(overrides: Partial<CadenceGame> = {}): CadenceGame {
  return {
    currentPlaying: 10,
    firstSeenAt: daysAgo(60),
    lastCollectedAt: hoursAgo(3),
    ...overrides,
  };
}

describe("collectionTier", () => {
  it("is busy at or above the player threshold", () => {
    const min = COLLECTION_CADENCE.busyMinPlaying;
    expect(collectionTier(game({ currentPlaying: min }), NOW)).toBe("busy");
    expect(collectionTier(game({ currentPlaying: min - 1 }), NOW)).toBe("low");
  });

  it("keeps newly discovered games busy while they may still be launching", () => {
    expect(collectionTier(game({ firstSeenAt: daysAgo(2) }), NOW)).toBe("busy");
    expect(collectionTier(game({ firstSeenAt: daysAgo(8) }), NOW)).toBe("low");
  });

  it("puts dead (0 CCU) games on the low tier, never drops them", () => {
    const dead = game({ currentPlaying: 0, lastCollectedAt: daysAgo(1) });
    expect(collectionTier(dead, NOW)).toBe("low");
    expect(isDueForCollection(dead, NOW)).toBe(true); // still followed, daily
  });
});

describe("isDueForCollection", () => {
  it("collects busy games on every run", () => {
    expect(
      isDueForCollection(game({ currentPlaying: 5000, lastCollectedAt: hoursAgo(1) }), NOW),
    ).toBe(true);
  });

  it("collects never-collected games immediately", () => {
    expect(isDueForCollection(game({ lastCollectedAt: null }), NOW)).toBe(true);
  });

  it("defers a quiet game collected within the last day", () => {
    expect(isDueForCollection(game({ lastCollectedAt: hoursAgo(3) }), NOW)).toBe(false);
    expect(isDueForCollection(game({ lastCollectedAt: hoursAgo(21) }), NOW)).toBe(false);
  });

  it("picks a quiet game up on the run near its 24h mark, despite start jitter", () => {
    // Runs are ~3h apart; the run at "24h" may start a few minutes early.
    expect(isDueForCollection(game({ lastCollectedAt: hoursAgo(23.8) }), NOW)).toBe(true);
    expect(isDueForCollection(game({ lastCollectedAt: hoursAgo(22.5) }), NOW)).toBe(true);
  });

  it("yields about 1 collection a day for a quiet game across 3-hourly runs", () => {
    let last: Date | null = null;
    let collected = 0;
    // 8 runs/day for 10 days, each starting up to 10 minutes late
    for (let run = 0; run < 80; run++) {
      const at = new Date(NOW.getTime() + run * 3 * 3_600_000 + (run % 3) * 5 * 60_000);
      if (isDueForCollection(game({ lastCollectedAt: last }), at)) {
        last = at;
        collected++;
      }
    }
    expect(collected).toBe(10);
  });
});
