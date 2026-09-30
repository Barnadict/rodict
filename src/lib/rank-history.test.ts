import { describe, expect, it } from "vitest";

import type { RankLadder } from "@/lib/db/analytics";
import { bestRank, countAbove, rankHistory, rankOnLadder, rankRows } from "@/lib/rank-history";

const H = 3_600_000;
const day = (d: string) => Date.parse(`${d}T00:00:00Z`);

function ladder(d: string, v: Record<string, number[]>, untilHour = 23): RankLadder {
  return {
    day: d,
    until: new Date(day(d) + untilHour * H),
    minPlayers: 1,
    n: Object.fromEntries(Object.entries(v).map(([k, list]) => [k, list.length + 1])),
    v,
  };
}

describe("countAbove", () => {
  it("counts strictly greater values in a descending list", () => {
    expect(countAbove([50, 40, 40, 10], 40)).toBe(1);
    expect(countAbove([50, 40, 40, 10], 45)).toBe(1);
    expect(countAbove([50, 40, 40, 10], 5)).toBe(4);
    expect(countAbove([50, 40, 40, 10], 60)).toBe(0);
    expect(countAbove([], 3)).toBe(0);
  });
});

describe("rankOnLadder", () => {
  const l = ladder("2026-09-30", { sim: [100, 40, 12], obby: [70, 12], _: [5] });

  it("ranks overall across every genre and within the game's own", () => {
    expect(rankOnLadder(40, "sim", l)).toEqual({
      overall: 3,
      overallOf: 4 + 3 + 2,
      genre: 2,
      genreOf: 4,
    });
  });

  it("gives ties the same rank", () => {
    expect(rankOnLadder(12, "obby", l).overall).toBe(4);
    expect(rankOnLadder(12, "sim", l).overall).toBe(4);
  });

  it("leaves games under the floor unranked", () => {
    expect(rankOnLadder(0, "sim", l)).toMatchObject({ overall: null, genre: null });
  });
});

describe("rankHistory", () => {
  const ladders = [
    ladder("2026-09-29", { sim: [100, 20] }),
    ladder("2026-09-30", { sim: [100, 30] }, 12),
  ];

  it("averages the game's readings per UTC day and rounds like the ladder", () => {
    const readings = [
      { t: day("2026-09-29") + 1 * H, playing: 19 },
      { t: day("2026-09-29") + 9 * H, playing: 20 }, // avg 19.5 -> 20
      { t: day("2026-09-30") + 3 * H, playing: 30 },
      { t: day("2026-09-30") + 15 * H, playing: 999 }, // after `until`: not in the ladder
    ];
    const points = rankHistory(readings, ladders, "sim");
    expect(points.map((p) => [p.date.slice(0, 10), p.value, p.overall])).toEqual([
      ["2026-09-29", 20, 2],
      ["2026-09-30", 30, 2],
    ]);
  });

  it("skips a day the range cutoff falls inside", () => {
    const readings = [
      { t: day("2026-09-29") + 20 * H, playing: 20 },
      { t: day("2026-09-30") + 3 * H, playing: 30 },
    ];
    const points = rankHistory(readings, ladders, "sim", new Date(day("2026-09-29") + 18 * H));
    expect(points.map((p) => p.date.slice(0, 10))).toEqual(["2026-09-30"]);
  });

  it("finds the best rank and fills missing days with nulls", () => {
    const points = rankHistory(
      [
        { t: day("2026-09-27") + H, playing: 20 },
        { t: day("2026-09-29") + H, playing: 150 },
      ],
      [ladder("2026-09-27", { sim: [100, 20] }), ladder("2026-09-29", { sim: [150, 20] })],
      "sim",
    );
    expect(bestRank(points, "overall")).toBe(1);
    expect(rankRows(points).map((r) => r.overall)).toEqual([2, null, 1]);
  });
});
