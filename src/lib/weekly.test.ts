import { describe, expect, it } from "vitest";

import type { RecentAnomaly } from "@/lib/db/analytics";
import {
  isoWeek,
  recapSections,
  weeklyFeedEntry,
  weeklySpikes,
  type WeeklyData,
} from "@/lib/weekly";

const NOW = new Date("2026-10-01T12:00:00Z");
const D = 86_400_000;

function anomaly(over: Partial<RecentAnomaly>): RecentAnomaly {
  return {
    scope: "game",
    id: "g1",
    name: "Game",
    at: new Date(NOW.getTime() - D).toISOString(),
    value: 200,
    prevValue: 100,
    changePct: 1,
    direction: "spike",
    score: 5,
    ...over,
  };
}

const EMPTY: WeeklyData = {
  risingGames: [],
  risingGenres: [],
  entrants: { total: 0, games: [] },
  deaths: { total: 0, games: [] },
  spikes: [],
};

describe("weeklySpikes", () => {
  it("keeps this week's spikes, biggest first", () => {
    const out = weeklySpikes(
      [
        anomaly({ id: "a", changePct: 0.5 }),
        anomaly({ id: "b", changePct: 2 }),
        anomaly({ id: "drop", direction: "drop", changePct: -0.9 }),
        anomaly({ id: "old", at: new Date(NOW.getTime() - 8 * D).toISOString(), changePct: 9 }),
        anomaly({ id: "bad", at: "not a date" }),
      ],
      NOW,
    );
    expect(out.map((a) => a.id)).toEqual(["b", "a"]);
  });
});

describe("isoWeek", () => {
  it("follows ISO 8601, including year edges", () => {
    expect(isoWeek(NOW)).toBe("2026-W40");
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01");
  });
});

describe("weeklyFeedEntry", () => {
  it("is keyed by week, stable across rebuilds in that week", () => {
    const a = weeklyFeedEntry(recapSections(EMPTY), NOW, "https://x.test");
    const b = weeklyFeedEntry(recapSections(EMPTY), new Date(NOW.getTime() + D), "https://x.test");
    expect(a.id).toBe("urn:rodict:weekly:2026-W40");
    expect(b.id).toBe(a.id);
    expect(a.summary).toMatch(/quiet week/);
  });

  it("lists sections with absolute, escaped links", () => {
    const data: WeeklyData = {
      ...EMPTY,
      risingGames: [
        {
          universeId: "42",
          name: "Tom & Jerry <3",
          genreName: null,
          basePlaying: 100,
          currentPlaying: 250,
          growthPct: 1.5,
        },
      ],
      deaths: {
        total: 12,
        games: [
          {
            universeId: "7",
            name: "Gone",
            deadSince: NOW,
            allTimePeakPlayers: 5000,
            genreName: null,
          },
        ],
      },
    };
    const e = weeklyFeedEntry(recapSections(data), NOW, "https://x.test");
    expect(e.content).toContain('<a href="https://x.test/games/42">Tom &amp; Jerry &lt;3</a>');
    expect(e.content).toContain("+150%");
    expect(e.content).toContain("…and 11 more.");
    expect(e.content).not.toContain("New entrants");
    expect(e.summary).toContain("Top rising games: Tom & Jerry <3");
  });
});
