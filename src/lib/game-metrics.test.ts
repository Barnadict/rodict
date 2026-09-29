import { describe, expect, it } from "vitest";

import {
  buildMetricSeries,
  cleanDescription,
  parseGameMetric,
  rankSimilarGames,
  robloxCreatorUrl,
  robloxGameUrl,
  similarCcuBand,
  type MetricSnapshot,
} from "./game-metrics";

const H = 3_600_000;
const t0 = Date.parse("2026-09-01T00:00:00Z");

function snap(hours: number, over: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    collectedAt: new Date(t0 + hours * H),
    playing: 100,
    visits: BigInt(1000),
    favorites: 50,
    upVotes: 90,
    downVotes: 10,
    ...over,
  };
}

describe("buildMetricSeries", () => {
  it("derives visits per day from cumulative visits", () => {
    const s = [
      snap(0, { visits: BigInt(1000) }),
      snap(3, { visits: BigInt(1300) }),
      snap(27, { visits: BigInt(2300) }),
    ];
    expect(buildMetricSeries(s, "visits").map((p) => p.value)).toEqual([2400, 1000]);
  });

  it("skips pairs across a collection gap and negative deltas", () => {
    const s = [
      snap(0, { visits: BigInt(1000) }),
      snap(24 * 40, { visits: BigInt(9000) }), // 40-day outage
      snap(24 * 40 + 3, { visits: BigInt(8000) }), // revised down
      snap(24 * 40 + 6, { visits: BigInt(8300) }),
    ];
    expect(buildMetricSeries(s, "visits").map((p) => p.value)).toEqual([2400]);
  });

  it("computes like ratio and skips snapshots without votes", () => {
    const s = [
      snap(0),
      snap(3, { upVotes: 0, downVotes: 0 }),
      snap(6, { upVotes: 3, downVotes: 1 }),
    ];
    expect(buildMetricSeries(s, "likes").map((p) => p.value)).toEqual([0.9, 0.75]);
  });

  it("passes players and favorites through", () => {
    const s = [snap(0, { playing: 5, favorites: 7 })];
    expect(buildMetricSeries(s, "players")[0].value).toBe(5);
    expect(buildMetricSeries(s, "favorites")[0].value).toBe(7);
  });
});

describe("parseGameMetric", () => {
  it("falls back to players", () => {
    expect(parseGameMetric("visits")).toBe("visits");
    expect(parseGameMetric("nope")).toBe("players");
    expect(parseGameMetric(undefined)).toBe("players");
  });
});

describe("similar games", () => {
  it("builds a band with a floor for tiny games", () => {
    expect(similarCcuBand(1000)).toEqual({ min: 250, max: 4000 });
    expect(similarCcuBand(0)).toEqual({ min: 0, max: 20 });
  });

  it("ranks shared themes first, then log-CCU closeness", () => {
    const ranked = rankSimilarGames(
      { currentPlaying: 1000, themeIds: ["anime"] },
      [
        { id: "far", currentPlaying: 3900, themeIds: [] },
        { id: "near", currentPlaying: 1100, themeIds: [] },
        { id: "themed", currentPlaying: 300, themeIds: ["anime"] },
      ],
      2,
    );
    expect(ranked.map((r) => r.id)).toEqual(["themed", "near"]);
    expect(ranked[0].sharedThemes).toBe(1);
  });
});

describe("roblox links", () => {
  it("builds game and creator urls", () => {
    expect(robloxGameUrl(BigInt(123))).toBe("https://www.roblox.com/games/123");
    expect(robloxGameUrl(null)).toBeNull();
    expect(robloxCreatorUrl(BigInt(5), "User")).toBe("https://www.roblox.com/users/5/profile");
    expect(robloxCreatorUrl(BigInt(5), "Group")).toBe("https://www.roblox.com/communities/5");
    expect(robloxCreatorUrl(null, "User")).toBeNull();
  });
});

describe("cleanDescription", () => {
  it("strips control and bidi characters and collapses blank lines", () => {
    expect(cleanDescription("  Hi‮ there\u0007 \r\n\r\n\r\n\r\nBye  ")).toBe("Hi there\n\nBye");
  });

  it("returns null for empty text and caps long text", () => {
    expect(cleanDescription("  ​ ")).toBeNull();
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription("a".repeat(5000))!.length).toBe(4001);
  });
});
