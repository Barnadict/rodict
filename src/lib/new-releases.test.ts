import { describe, expect, it } from "vitest";

import {
  dailyByAge,
  parseNewReleaseSort,
  releaseKind,
  sortNewReleases,
  summarizeLifecycle,
  weekOverWeek,
  type Reading,
} from "./new-releases";

const H = 3_600_000;
const D = 24 * H;
const created = new Date("2026-09-01T00:00:00Z");
const t0 = created.getTime();

describe("releaseKind", () => {
  it("splits by creation date against the cutoff", () => {
    const cutoff = new Date("2026-08-31T00:00:00Z");
    expect(releaseKind(created, cutoff)).toBe("new-on-roblox");
    expect(releaseKind(new Date("2020-01-01"), cutoff)).toBe("newly-tracked");
    expect(releaseKind(null, cutoff)).toBe("newly-tracked");
  });
});

describe("dailyByAge", () => {
  it("averages each day since launch and drops out-of-range readings", () => {
    const readings: Reading[] = [
      { t: t0 - H, playing: 999 }, // before launch
      { t: t0 + 1 * H, playing: 10 },
      { t: t0 + 5 * H, playing: 30 },
      { t: t0 + D + H, playing: 50 },
      { t: t0 + 40 * D, playing: 1 }, // past maxDays
    ];
    expect(dailyByAge(readings, created, 30)).toEqual([
      { day: 0, value: 20 },
      { day: 1, value: 50 },
    ]);
  });
});

describe("summarizeLifecycle", () => {
  it("gives median and quartiles per day and drops thin days", () => {
    const rows = [
      { gameId: "a", day: 0, avg: 10 },
      { gameId: "b", day: 0, avg: 20 },
      { gameId: "c", day: 0, avg: 30 },
      { gameId: "d", day: 0, avg: 1000 },
      { gameId: "a", day: 1, avg: 5 },
      { gameId: "b", day: 1, avg: 6 },
    ];
    const out = summarizeLifecycle(rows, 3);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ day: 0, median: 25, nGames: 4 });
    expect(out[0].p25).toBeCloseTo(17.5);
    expect(out[0].p75).toBeCloseTo(272.5);
  });
});

describe("weekOverWeek", () => {
  it("compares the last 24h with the same 24h a week earlier", () => {
    const readings: Reading[] = [
      { t: t0, playing: 100 }, // 9 days before the latest: outside both windows
      { t: t0 + D + 12 * H, playing: 50 }, // in the week-ago window
      { t: t0 + 8 * D + 12 * H, playing: 150 },
      { t: t0 + 9 * D, playing: 50 }, // latest
    ];
    const c = weekOverWeek(readings)!;
    expect(c.base).toBe(50);
    expect(c.current).toBe(100);
    expect(c.pct).toBe(1);
  });

  it("is null without a reading a week back", () => {
    expect(
      weekOverWeek([
        { t: t0, playing: 1 },
        { t: t0 + H, playing: 2 },
      ]),
    ).toBeNull();
  });
});

describe("sortNewReleases", () => {
  const rows = [
    { id: "a", currentPlaying: 10, change: { base: 1, current: 2, pct: 1 } },
    { id: "b", currentPlaying: 500, change: null },
    { id: "c", currentPlaying: 50, change: { base: 1, current: 3, pct: 2 } },
    { id: "d", currentPlaying: 5, change: null },
  ];
  it("sorts by players or by growth with unmeasured last", () => {
    expect(sortNewReleases(rows, "players").map((r) => r.id)).toEqual(["b", "c", "a", "d"]);
    expect(sortNewReleases(rows, "growth").map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
    expect(parseNewReleaseSort("growth")).toBe("growth");
    expect(parseNewReleaseSort(undefined)).toBe("players");
  });
});
