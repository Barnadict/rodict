import { describe, it, expect } from "vitest";

import { graveStats, parseGraveSort, sortGraves, summarizeGraves } from "./graveyard";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function grave(
  id: string,
  peak: number,
  created: string | null,
  peakAt: string | null,
  died: string,
) {
  const input = {
    deadSince: d(died),
    robloxCreatedAt: created ? d(created) : null,
    allTimePeakAt: peakAt ? d(peakAt) : null,
    allTimePeakPlayers: peak,
  };
  return { id, ...input, ...graveStats(input) };
}

const rows = [
  grave("old", 500, "2026-01-01", "2026-02-01", "2026-09-01"),
  grave("quick", 9000, "2026-08-01", "2026-08-03", "2026-08-13"),
  grave("undated", 50, null, null, "2026-09-20"),
];

describe("graveStats", () => {
  it("measures lifespan and peak → death in days", () => {
    expect(rows[1].lifespanDays).toBe(12);
    expect(rows[1].peakToDeathDays).toBe(10);
    expect(rows[2].lifespanDays).toBeNull();
  });
});

describe("sortGraves", () => {
  const ids = (sort: Parameters<typeof sortGraves>[1]) => sortGraves(rows, sort).map((r) => r.id);
  it("sorts each way, unknown values last", () => {
    expect(ids("recent")).toEqual(["undated", "old", "quick"]);
    expect(ids("peak")).toEqual(["quick", "old", "undated"]);
    expect(ids("lifespan")).toEqual(["old", "quick", "undated"]);
    expect(ids("fall")).toEqual(["quick", "old", "undated"]);
  });

  it("parses the sort param", () => {
    expect(parseGraveSort("fall")).toBe("fall");
    expect(parseGraveSort("nope")).toBe("recent");
  });
});

describe("summarizeGraves", () => {
  it("takes medians over known values", () => {
    expect(summarizeGraves(rows)).toEqual({
      count: 3,
      medianLifespanDays: (243 + 12) / 2,
      medianPeakToDeathDays: (212 + 10) / 2,
    });
    expect(summarizeGraves([])).toEqual({
      count: 0,
      medianLifespanDays: null,
      medianPeakToDeathDays: null,
    });
  });
});
