import { describe, expect, it } from "vitest";

import type { ConcentrationDay } from "@/lib/db/analytics";
import {
  concentrationLevel,
  concentrationRows,
  effectiveGames,
  hhiPoints,
  latestWithBaseline,
} from "@/lib/concentration";

function point(d: string, hhi = 0.2): ConcentrationDay {
  return { day: d, n: 10, total: 100, top1: 0.3, top5: 0.7, top10: 1, hhi };
}

describe("concentration labels", () => {
  it("uses the 1,500 / 2,500 HHI bands", () => {
    expect(concentrationLevel(0.1)).toBe("many small games");
    expect(concentrationLevel(0.15)).toBe("a few leaders");
    expect(concentrationLevel(0.25)).toBe("a few leaders");
    expect(concentrationLevel(0.4)).toBe("a few giants");
  });

  it("converts HHI to equal games and points", () => {
    expect(effectiveGames(0.25)).toBe(4);
    expect(effectiveGames(0)).toBeNull();
    expect(hhiPoints(0.2562)).toBe(2562);
  });
});

describe("concentrationRows", () => {
  it("fills days without data with nulls so the chart breaks", () => {
    const rows = concentrationRows([point("2026-08-19"), point("2026-08-21")]);
    expect(rows.map((r) => [r.date.slice(0, 10), r.top1])).toEqual([
      ["2026-08-19", 0.3],
      ["2026-08-20", null],
      ["2026-08-21", 0.3],
    ]);
    expect(concentrationRows([])).toEqual([]);
  });
});

describe("latestWithBaseline", () => {
  it("pairs the latest day with the last day at least 30 days earlier", () => {
    const days = [
      point("2026-08-01"),
      point("2026-08-25"),
      point("2026-09-01"),
      point("2026-09-30"),
    ];
    const r = latestWithBaseline(days)!;
    expect(r.latest.day).toBe("2026-09-30");
    expect(r.baseline?.day).toBe("2026-08-25");
  });

  it("has no baseline when history is short", () => {
    expect(latestWithBaseline([point("2026-09-29"), point("2026-09-30")])!.baseline).toBeNull();
    expect(latestWithBaseline([])).toBeNull();
  });
});
