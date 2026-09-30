import { describe, expect, it } from "vitest";

import { RANGE_OPTIONS } from "@/lib/date-range";
import { CADENCE, summarizeCadence, type CadenceGame } from "@/lib/update-cadence";

const NOW = new Date("2026-10-01T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function game(id: string, genreId: string | null, updatedDaysAgo: number | null): CadenceGame {
  return {
    id,
    universeId: id,
    name: id,
    genreId,
    currentPlaying: 100,
    robloxUpdatedAt: updatedDaysAgo === null ? null : daysAgo(updatedDaysAgo),
  };
}

describe("summarizeCadence", () => {
  const games = [
    game("a", "sim", 1),
    game("b", "sim", 10),
    game("c", "sim", 200),
    game("d", "obby", null),
  ];
  // "a": updates 1, 5 and 11 days ago (gaps 4 and 6, and the first from 20 days ago).
  const changes = [
    { gameId: "a", updatedAt: daysAgo(1), previousUpdatedAt: daysAgo(5) },
    { gameId: "a", updatedAt: daysAgo(5), previousUpdatedAt: daysAgo(11) },
    { gameId: "a", updatedAt: daysAgo(11), previousUpdatedAt: daysAgo(31) },
    { gameId: "b", updatedAt: daysAgo(10), previousUpdatedAt: daysAgo(50) },
    { gameId: "c", updatedAt: daysAgo(60), previousUpdatedAt: daysAgo(80) },
  ];
  const r = summarizeCadence(games, changes, new Map([["a", 0.5]]), NOW);
  const sim = r.genres.find((g) => g.genreId === "sim")!;

  it("uses every game's last-updated time for the recent share and days since", () => {
    expect(sim.games).toBe(3);
    expect(sim.updatedRecentlyShare).toBeCloseTo(2 / 3);
    expect(sim.medianDaysSinceUpdate).toBe(10);
    expect(r.genres.find((g) => g.genreId === "obby")!.updatedRecentlyShare).toBeNull();
  });

  it("takes the median of each game's own median gap", () => {
    // a: gaps 4, 6, 20 -> 6; b: 40; c: 20 -> median 20.
    expect(sim.medianDaysBetween).toBe(20);
    expect(sim.intervalGames).toBe(3);
    expect(sim.recentUpdates).toBe(4);
  });

  it("lists the most updated games in the window", () => {
    expect(r.top.map((t) => [t.id, t.updates])).toEqual([
      ["a", 3],
      ["b", 1],
    ]);
    expect(r.topByGenre.sim.map((t) => t.id)).toEqual(["a", "b"]);
    expect(r.trackedSince).toBe(daysAgo(60).toISOString());
  });

  it("buckets games by recent updates and only measures big-enough buckets", () => {
    expect(r.buckets.map((b) => b.games)).toEqual([2, 1, 1, 0]);
    expect(r.buckets[2]).toMatchObject({ withGrowth: 1, medianGrowth: null });
  });

  it("shows a bucket's median once it has enough games", () => {
    const many = Array.from({ length: CADENCE.minBucketGames }, (_, i) => game(`g${i}`, "sim", 99));
    const growth = new Map(many.map((g, i) => [g.id, i < 4 ? -0.1 : 0.2]));
    const out = summarizeCadence(many, [], growth, NOW);
    expect(out.buckets[0]).toMatchObject({ medianGrowth: 0.2, shareUp: 0.6 });
  });
});

describe("CADENCE", () => {
  it("matches a range key, since /updates reads the cached growth for it", () => {
    expect(RANGE_OPTIONS.some((o) => o.value === `${CADENCE.recentDays}d`)).toBe(true);
  });
});
