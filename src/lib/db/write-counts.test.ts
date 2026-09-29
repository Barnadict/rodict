import { describe, expect, it } from "vitest";

import {
  addWrites,
  mergeWrites,
  summarizeBudget,
  totalWrites,
  type WriteCounts,
} from "./write-counts";

describe("write counts", () => {
  it("adds per table and totals inserts + updates + deletes", () => {
    const c: WriteCounts = {};
    addWrites(c, "Game", { inserted: 2, updated: 10 });
    addWrites(c, "Game", { updated: 5 });
    addWrites(c, "GameTheme", { deleted: 3 });
    expect(c.Game).toEqual({ inserted: 2, updated: 15, deleted: 0 });
    expect(totalWrites(c)).toBe(20);
  });

  it("merges several runs", () => {
    const merged = mergeWrites(
      { Game: { inserted: 1, updated: 0, deleted: 0 } },
      {
        Game: { inserted: 0, updated: 4, deleted: 1 },
        GenreSnapshot: { inserted: 20, updated: 0, deleted: 0 },
      },
    );
    expect(totalWrites(merged)).toBe(26);
  });
});

describe("summarizeBudget", () => {
  // 2026-09-11T00:00Z — day 10 of a 30-day month
  const now = new Date(Date.UTC(2026, 8, 11));
  const at = (day: number) => new Date(Date.UTC(2026, 8, day));

  it("sums measured writes (plus the JobRun row) and projects the rest of the month", () => {
    const r = summarizeBudget(
      [
        { job: "collect", startedAt: at(2), summary: { writesTotal: 999 } },
        { job: "collect", startedAt: at(3), summary: { writesTotal: 999 } },
        {
          job: "analytics",
          startedAt: at(3),
          summary: { writesTotal: 99, rowsLoaded: { GameSnapshot: 500 } },
        },
      ],
      now,
      { collect: 8, analytics: 2 },
    );
    expect(r.daysInMonth).toBe(30);
    expect(r.daysElapsed).toBe(10);
    expect(r.measuredWritesToDate).toBe(2000 + 100);
    expect(r.jobs.collect.avgWritesPerRun).toBe(1000);
    // per day on schedule: 8 * 1000 + 2 * 100 = 8200; 20 days remain
    expect(r.projectedMonthWrites).toBe(2100 + 8200 * 20);
    expect(r.fullMonthWritesAtSchedule).toBe(8200 * 30);
    expect(r.fullMonthAnalyticsReadsAtSchedule).toBe(500 * 2 * 30);
  });

  it("reports pre-#42 runs as unmeasured instead of guessing", () => {
    const r = summarizeBudget(
      [
        { job: "collect", startedAt: at(2), summary: { writesTotal: 10 } },
        { job: "collect", startedAt: at(2), summary: null },
      ],
      now,
      { collect: 8 },
    );
    expect(r.unmeasuredRuns).toBe(1);
    expect(r.measuredWritesToDate).toBe(11);
  });

  it("gives no projection until every scheduled job has a measured run", () => {
    const r = summarizeBudget(
      [{ job: "collect", startedAt: at(2), summary: { writesTotal: 10 } }],
      now,
      { collect: 8, analytics: 2 },
    );
    expect(r.projectedMonthWrites).toBeNull();
  });

  it("ignores runs from other months", () => {
    const r = summarizeBudget(
      [
        {
          job: "collect",
          startedAt: new Date(Date.UTC(2026, 7, 30)),
          summary: { writesTotal: 10 },
        },
      ],
      now,
      { collect: 0 },
    );
    expect(r.jobs).toEqual({});
    expect(r.projectedMonthWrites).toBe(0);
  });
});
