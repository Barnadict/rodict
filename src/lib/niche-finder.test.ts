import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  applyFilters,
  hhiOf,
  parseFilters,
  percentile,
  pooledGrowth,
  pooledSession,
  reasons,
  scoreRows,
  sortRows,
  themeRows,
  third,
  type NicheRow,
} from "@/lib/niche-finder";

const row = (id: string, over: Partial<NicheRow> = {}): NicheRow => ({
  kind: "genre",
  id,
  slug: id,
  name: id.toUpperCase(),
  totalPlaying: 1000,
  gameCount: 10,
  playersPerGame: 100,
  growth7d: 0,
  hhi: 0.1,
  sessionMinutes: 20,
  score: null,
  ...over,
});

describe("scoreRows", () => {
  it("matches analytics/opportunity.py's formula", () => {
    const scored = scoreRows([
      row("a", { playersPerGame: 100, totalPlaying: 1000, gameCount: 10, growth7d: 0.1 }),
      row("b", { playersPerGame: 50, totalPlaying: 2000, gameCount: 40, growth7d: 0 }),
      // Unknown growth counts as 0, like the Python's fillna(0).
      row("c", { playersPerGame: 10, totalPlaying: 100, gameCount: 10, growth7d: null }),
    ]);
    // a: .4·1 + .25·(900/1900) + .2·1 − .15·0 = .7184; b: .4·(40/90) + .25 − .15 = .2778.
    expect(scored.map((r) => r.score)).toEqual([100, 38.7, 0]);
  });

  it("gives a flat pool the middle of every component", () => {
    expect(scoreRows([row("a"), row("b")]).map((r) => r.score)).toEqual([50, 50]);
    expect(scoreRows([])).toEqual([]);
  });
});

describe("theme figures", () => {
  it("computes HHI over games with players, with a floor", () => {
    expect(hhiOf([50, 50], 2)).toBeCloseTo(0.5);
    expect(hhiOf([50, 50, 0], 3)).toBeNull();
    expect(hhiOf([0, 0], 1)).toBeNull();
  });

  it("pools session length by players", () => {
    // 100 players at 10 min and 100 at 40 min: 200 ÷ (10 + 2.5) visits/min = 16 min.
    expect(
      pooledSession(
        [
          { playing: 100, minutes: 10 },
          { playing: 100, minutes: 40 },
        ],
        2,
      ),
    ).toBeCloseTo(16);
    expect(pooledSession([{ playing: 100, minutes: 10 }], 2)).toBeNull();
  });

  it("pools growth as the combined change", () => {
    expect(
      pooledGrowth(
        [
          { basePlaying: 100, currentPlaying: 150 },
          { basePlaying: 100, currentPlaying: 50 },
        ],
        2,
      ),
    ).toBe(0);
    expect(pooledGrowth([{ basePlaying: 100, currentPlaying: 150 }], 2)).toBeNull();
  });

  it("builds one row per theme with games", () => {
    const rows = themeRows(
      [
        { id: "t1", slug: "anime", name: "Anime" },
        { id: "t2", slug: "empty", name: "Empty" },
      ],
      [
        { themeId: "t1", gameId: "g1", playing: 300 },
        { themeId: "t1", gameId: "g2", playing: 100 },
      ],
      new Map([["g1", 30]]),
      new Map(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "theme",
      slug: "anime",
      totalPlaying: 400,
      gameCount: 2,
      playersPerGame: 200,
      // Under the theme floors: too few games to say.
      growth7d: null,
      hhi: null,
      sessionMinutes: null,
    });
  });
});

describe("filters", () => {
  const pool = [
    row("small", { totalPlaying: 100, gameCount: 5, growth7d: -0.2, hhi: 0.4, sessionMinutes: 8 }),
    row("mid", { totalPlaying: 1000, gameCount: 50, growth7d: 0.05, hhi: 0.2 }),
    row("large", {
      totalPlaying: 10000,
      gameCount: 500,
      growth7d: 0.2,
      hhi: 0.05,
      sessionMinutes: 45,
    }),
  ];
  const ids = (rows: NicheRow[]) => rows.map((r) => r.id);

  it("splits size and crowding into thirds of the pool", () => {
    expect(percentile(1000, [100, 1000, 10000])).toBe(0.5);
    expect(third(100, [100, 1000, 10000])).toBe("low");
    expect(third(10000, [100, 1000, 10000])).toBe("high");
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, size: "small" }))).toEqual(["small"]);
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, crowd: "many" }))).toEqual(["large"]);
  });

  it("filters growth, concentration and session", () => {
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, growth: "growing" }))).toEqual([
      "mid",
      "large",
    ]);
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, growth: "fast" }))).toEqual(["large"]);
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, growth: "shrinking" }))).toEqual(["small"]);
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, concentration: "giants" }))).toEqual([
      "small",
    ]);
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, concentration: "spread" }))).toEqual([
      "large",
    ]);
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, session: "medium" }))).toEqual(["mid"]);
    expect(ids(applyFilters(pool, { ...DEFAULT_FILTERS, session: "long" }))).toEqual(["large"]);
  });

  it("drops rows without the figure a filter needs", () => {
    const rows = [row("x", { growth7d: null, hhi: null, sessionMinutes: null })];
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, growth: "growing" })).toEqual([]);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, concentration: "spread" })).toEqual([]);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, session: "short" })).toEqual([]);
    expect(applyFilters(rows, DEFAULT_FILTERS)).toHaveLength(1);
  });

  it("parses the query string, ignoring unknown values", () => {
    const q: Record<string, string> = { size: "large", conc: "spread", sort: "nope" };
    expect(parseFilters((k) => q[k])).toEqual({
      ...DEFAULT_FILTERS,
      size: "large",
      concentration: "spread",
    });
  });
});

describe("sortRows", () => {
  it("sorts by the chosen figure, missing values last", () => {
    const rows = [
      row("a", { score: 10, hhi: null }),
      row("b", { score: 90, hhi: 0.3 }),
      row("c", { score: null, hhi: 0.1 }),
    ];
    expect(sortRows(rows, "score").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortRows(rows, "open").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("reasons", () => {
  const pool = [
    row("a", { playersPerGame: 500, totalPlaying: 5000, gameCount: 10, growth7d: 0.3 }),
    row("b", { playersPerGame: 100, totalPlaying: 20000, gameCount: 200, growth7d: 0 }),
    row("c", { playersPerGame: 10, totalPlaying: 500, gameCount: 50, growth7d: -0.1 }),
  ];

  it("lists the components above the middle, strongest first", () => {
    expect(reasons(pool[0], pool)).toEqual([
      "500 players per game, more than all other genres",
      "+30% players over 7 days, faster than all other genres",
      "10 games, fewer than all other genres",
    ]);
  });

  it("places a middle component as a share of the others", () => {
    expect(reasons(pool[1], pool)).toEqual(["20K players in all, more than all other genres"]);
  });

  it("says so when nothing stands out", () => {
    expect(reasons(pool[2], pool)).toEqual([
      "Near or below the middle of genres on every part of the score",
    ]);
  });
});
