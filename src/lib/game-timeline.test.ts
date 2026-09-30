import { describe, expect, it } from "vitest";

import { bigRankChanges, buildTimeline } from "@/lib/game-timeline";
import type { RankPoint } from "@/lib/rank-history";
import type { UpdateWindowImpact } from "@/lib/update-impact";

const point = (date: string, overall: number | null, genre: number | null = null): RankPoint => ({
  date: `${date}T00:00:00.000Z`,
  value: 0,
  overall,
  overallOf: 5000,
  genre,
  genreOf: 300,
});

const window24 = (status: UpdateWindowImpact["status"], changePct: number | null) =>
  ({
    hours: 24,
    status,
    before: null,
    after: null,
    nBefore: 0,
    nAfter: 0,
    changePct,
    overlapped: false,
  }) satisfies UpdateWindowImpact;

describe("bigRankChanges", () => {
  it("keeps moves that halve or double the rank by enough places", () => {
    const events = bigRankChanges([
      point("2026-09-01", 400),
      point("2026-09-02", 180, 12), // 400 → 180: more than halved
      point("2026-09-03", 200), // small move
      point("2026-09-04", 450), // 200 → 450: more than doubled
    ]);
    expect(events.map((e) => [e.from, e.to])).toEqual([
      [400, 180],
      [200, 450],
    ]);
    expect(events[0]).toMatchObject({ at: "2026-09-02T00:00:00.000Z", genre: 12 });
  });

  it("ignores moves of fewer than the minimum places", () => {
    expect(bigRankChanges([point("2026-09-01", 2), point("2026-09-02", 8)])).toEqual([]);
  });

  it("doesn't bridge a collection pause", () => {
    expect(bigRankChanges([point("2026-08-19", 400), point("2026-09-30", 100)])).toEqual([]);
  });

  it("skips unranked days but compares across them when close", () => {
    const events = bigRankChanges([
      point("2026-09-01", 400),
      point("2026-09-02", null),
      point("2026-09-03", 100),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from: 400, to: 100 });
  });
});

describe("buildTimeline", () => {
  const input = {
    updates: [
      { updatedAt: new Date("2026-09-30T12:00:00Z"), windows: [window24("pending", null)] },
      { updatedAt: new Date("2026-09-10T12:00:00Z"), windows: [window24("ok", 0.25)] },
    ],
    anomalies: [
      {
        at: "2026-09-20T06:00:00Z",
        value: 900,
        prevValue: 300,
        changePct: 2,
        direction: "spike" as const,
        score: 5,
      },
    ],
    ranks: [point("2026-09-14", 500), point("2026-09-15", 200)],
    passCatalog: {
      changedAt: new Date("2026-09-25T00:00:00Z"),
      forSaleCount: 4,
      totalRobux: 1200,
    },
  };

  it("merges every source newest first", () => {
    const { events, total } = buildTimeline(input);
    expect(total).toBe(5);
    expect(events.map((e) => e.kind)).toEqual(["update", "passes", "spike", "rank", "update"]);
    expect(events[0]).toMatchObject({ pending: true, change24h: null });
    expect(events[4]).toMatchObject({ pending: false, change24h: 0.25 });
  });

  it("cuts to the limit but reports the full count", () => {
    const { events, total } = buildTimeline(input, 2);
    expect(events).toHaveLength(2);
    expect(total).toBe(5);
  });

  it("handles a game with nothing recorded", () => {
    expect(buildTimeline({ updates: [], anomalies: [], ranks: [], passCatalog: null })).toEqual({
      events: [],
      total: 0,
    });
  });
});
