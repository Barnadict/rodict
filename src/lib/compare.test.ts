import { describe, expect, it } from "vitest";

import {
  COMPARE_MAX,
  compareHref,
  indexSeries,
  latestAtOrBefore,
  mergeSeries,
  parseCompareScale,
  parseCompareSelection,
  parseIdList,
  windowAverageChange,
  withAdded,
  withRemoved,
  type SeriesPoint,
} from "./compare";

const H = 3_600_000;

describe("parseIdList", () => {
  it("keeps valid, unique ids up to the cap", () => {
    expect(parseIdList("1, 2,2,abc,3,4,5", "game")).toEqual(["1", "2", "3", "4"]);
    expect(parseIdList("rpg,Bad Slug,tower-defense,rpg", "genre")).toEqual([
      "rpg",
      "tower-defense",
    ]);
    expect(parseIdList(undefined, "game")).toEqual([]);
    expect(parseIdList("", "genre")).toEqual([]);
  });

  it("parses a whole selection", () => {
    expect(parseCompareSelection({ games: "9", genres: "obby" })).toEqual({
      games: ["9"],
      genres: ["obby"],
    });
  });
});

describe("selection edits", () => {
  const sel = { games: ["1", "2"], genres: ["rpg"] };

  it("adds once and drops the oldest when full", () => {
    expect(withAdded(sel, "game", "2")).toBe(sel);
    expect(withAdded(sel, "genre", "obby").genres).toEqual(["rpg", "obby"]);
    const full = { games: ["1", "2", "3", "4"], genres: [] };
    expect(withAdded(full, "game", "5").games).toEqual(["2", "3", "4", "5"]);
    expect(withAdded(full, "game", "5").games).toHaveLength(COMPARE_MAX);
  });

  it("removes", () => {
    expect(withRemoved(sel, "game", "1").games).toEqual(["2"]);
    expect(withRemoved(sel, "genre", "nope")).toEqual(sel);
  });

  it("builds a readable link that keeps extra params", () => {
    expect(compareHref(sel, { range: "30d", scale: undefined })).toBe(
      "/compare?games=1,2&genres=rpg&range=30d",
    );
    expect(compareHref({ games: [], genres: [] })).toBe("/compare");
  });
});

describe("indexSeries", () => {
  it("rebases to 100 at the first positive reading", () => {
    const pts: SeriesPoint[] = [
      { t: 0, value: 0 },
      { t: 1, value: 50 },
      { t: 2, value: 75 },
    ];
    expect(indexSeries(pts)).toEqual([
      { t: 1, value: 100 },
      { t: 2, value: 150 },
    ]);
    expect(indexSeries([{ t: 0, value: 0 }])).toEqual([]);
    expect(parseCompareScale("indexed")).toBe("indexed");
    expect(parseCompareScale("x")).toBe("absolute");
  });
});

describe("mergeSeries", () => {
  it("interpolates within a series' own span and breaks across long gaps", () => {
    const busy: SeriesPoint[] = [0, 3, 6, 9, 200, 203].map((h) => ({ t: h * H, value: h }));
    const quiet: SeriesPoint[] = [
      { t: 0, value: 10 },
      { t: 6 * H, value: 40 },
    ];
    const rows = mergeSeries(
      [
        { key: "a", points: busy },
        { key: "b", points: quiet },
      ],
      72 * H,
    );
    // 104.5h is the break row in the middle of busy's 9h→200h gap.
    expect(rows.map((r) => r.t / H)).toEqual([0, 3, 6, 9, 104.5, 200, 203]);
    expect(rows.find((r) => r.t === 104.5 * H)!.a).toBeNull();
    const at = (h: number) => rows.find((r) => r.t === h * H)!;
    expect(at(3).b).toBe(25); // interpolated between quiet's readings
    expect(at(9).b).toBeNull(); // after quiet's last reading
    expect(at(9).a).toBe(9);
    expect(at(200).a).toBe(200);
    // No row falls inside busy's 9h→200h gap, and nothing bridges it: the
    // interpolation rule only applies within gapMs.
    const inGap = mergeSeries(
      [
        { key: "a", points: busy },
        { key: "c", points: [{ t: 100 * H, value: 1 }] },
      ],
      72 * H,
    );
    expect(inGap.find((r) => r.t === 100 * H)!.a).toBeNull();
  });
});

describe("latestAtOrBefore", () => {
  const pts: SeriesPoint[] = [
    { t: 0, value: 1 },
    { t: 10, value: 2 },
    { t: 20, value: 3 },
  ];
  it("finds the latest reading not too old", () => {
    expect(latestAtOrBefore(pts, 15, 100)?.value).toBe(2);
    expect(latestAtOrBefore(pts, 20, 100)?.value).toBe(3);
    expect(latestAtOrBefore(pts, -1, 100)).toBeNull();
    expect(latestAtOrBefore(pts, 50, 5)).toBeNull();
  });
});

describe("windowAverageChange", () => {
  it("compares first and last window averages", () => {
    const pts: SeriesPoint[] = [0, 12, 24, 36, 48].map((h, i) => ({
      t: h * H,
      value: [100, 100, 150, 200, 200][i],
    }));
    const c = windowAverageChange(pts, 24 * H)!;
    expect(c.base).toBe(100);
    expect(c.current).toBe(200);
    expect(c.pct).toBe(1);
  });

  it("needs two full windows", () => {
    expect(
      windowAverageChange(
        [
          { t: 0, value: 1 },
          { t: 30 * H, value: 2 },
        ],
        24 * H,
      ),
    ).toBeNull();
  });
});
