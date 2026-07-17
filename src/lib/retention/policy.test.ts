import { describe, it, expect } from "vitest";

import { planDownsample, utcDayKey, isoWeekKey, type SnapshotRef } from "./policy";

/**
 * Downsampling permanently DELETES snapshot rows, and deleted history can never
 * be re-fetched from Roblox. A planner bug is therefore unrecoverable, which is
 * why the decision is a pure function and why it's pinned down here.
 */

const NOW = new Date("2026-07-16T12:00:00Z");
const DAY = 86_400_000;

/** A snapshot `days` before NOW. */
function snap(id: string, days: number, hours = 0): SnapshotRef {
  return { id, collectedAt: new Date(NOW.getTime() - days * DAY - hours * 3_600_000) };
}

describe("utcDayKey", () => {
  it("keys by UTC calendar day", () => {
    expect(utcDayKey(new Date("2026-07-16T23:59:59Z"))).toBe("2026-07-16");
    expect(utcDayKey(new Date("2026-07-17T00:00:00Z"))).toBe("2026-07-17");
  });
});

describe("isoWeekKey", () => {
  it("groups a Monday and the following Sunday into the same ISO week", () => {
    expect(isoWeekKey(new Date("2026-07-13T00:00:00Z"))).toBe(
      isoWeekKey(new Date("2026-07-19T23:59:59Z")),
    );
  });

  it("starts a new week on Monday", () => {
    expect(isoWeekKey(new Date("2026-07-19T00:00:00Z"))).not.toBe(
      isoWeekKey(new Date("2026-07-20T00:00:00Z")),
    );
  });

  it("puts a year-boundary date in the ISO year its week belongs to", () => {
    // 2027-01-01 is a Friday, so ISO-8601 places it in 2026-W53 — not 2027-W01.
    // Getting this wrong would bucket New Year snapshots into the wrong week
    // and delete the wrong rows.
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});

describe("planDownsample", () => {
  it("keeps every snapshot inside the hourly window", () => {
    const snaps = [snap("a", 0), snap("b", 1), snap("c", 3), snap("d", 6.9)];
    const plan = planDownsample(snaps, NOW);
    expect(plan.keep.sort()).toEqual(["a", "b", "c", "d"]);
    expect(plan.remove).toEqual([]);
  });

  it("keeps only the newest snapshot per UTC day in the daily window", () => {
    // Three snapshots on the same day, 30 days old — one survives.
    const snaps: SnapshotRef[] = [
      { id: "morning", collectedAt: new Date("2026-06-16T02:00:00Z") },
      { id: "noon", collectedAt: new Date("2026-06-16T12:00:00Z") },
      { id: "night", collectedAt: new Date("2026-06-16T22:00:00Z") },
    ];
    const plan = planDownsample(snaps, NOW);
    expect(plan.keep).toEqual(["night"]);
    expect(plan.remove.sort()).toEqual(["morning", "noon"]);
  });

  it("keeps one snapshot per day across different days", () => {
    const snaps: SnapshotRef[] = [
      { id: "d1a", collectedAt: new Date("2026-06-16T02:00:00Z") },
      { id: "d1b", collectedAt: new Date("2026-06-16T22:00:00Z") },
      { id: "d2a", collectedAt: new Date("2026-06-17T02:00:00Z") },
      { id: "d2b", collectedAt: new Date("2026-06-17T22:00:00Z") },
    ];
    const plan = planDownsample(snaps, NOW);
    expect(plan.keep.sort()).toEqual(["d1b", "d2b"]);
    expect(plan.remove.sort()).toEqual(["d1a", "d2a"]);
  });

  it("keeps only the newest snapshot per ISO week beyond the daily window", () => {
    // ~200 days old: same ISO week (Mon 2025-12-29 .. Sun 2026-01-04).
    const snaps: SnapshotRef[] = [
      { id: "mon", collectedAt: new Date("2025-12-29T00:00:00Z") },
      { id: "wed", collectedAt: new Date("2025-12-31T00:00:00Z") },
      { id: "sun", collectedAt: new Date("2026-01-04T00:00:00Z") },
    ];
    const plan = planDownsample(snaps, NOW);
    expect(plan.keep).toEqual(["sun"]);
    expect(plan.remove.sort()).toEqual(["mon", "wed"]);
  });

  it("picks the bucket winner regardless of input order", () => {
    // Snapshots arrive newest-first here; the newest must still win.
    const snaps: SnapshotRef[] = [
      { id: "night", collectedAt: new Date("2026-06-16T22:00:00Z") },
      { id: "morning", collectedAt: new Date("2026-06-16T02:00:00Z") },
    ];
    expect(planDownsample(snaps, NOW).keep).toEqual(["night"]);
  });

  it("is idempotent — re-planning over the kept set removes nothing", () => {
    // The job runs on a schedule; a non-idempotent planner would erode history
    // a little more on every run until only one point per game remained.
    const snaps: SnapshotRef[] = [
      { id: "recent", collectedAt: new Date("2026-07-15T00:00:00Z") },
      { id: "d1a", collectedAt: new Date("2026-06-16T02:00:00Z") },
      { id: "d1b", collectedAt: new Date("2026-06-16T22:00:00Z") },
      { id: "w1a", collectedAt: new Date("2025-12-29T00:00:00Z") },
      { id: "w1b", collectedAt: new Date("2026-01-04T00:00:00Z") },
    ];
    const first = planDownsample(snaps, NOW);
    const survivors = snaps.filter((s) => first.keep.includes(s.id));
    const second = planDownsample(survivors, NOW);

    expect(second.remove).toEqual([]);
    expect(second.keep.sort()).toEqual(first.keep.sort());
  });

  it("accounts for every snapshot exactly once", () => {
    // Nothing may be silently dropped from both lists, or counted in both.
    const snaps: SnapshotRef[] = [
      snap("hourly", 1),
      { id: "d1", collectedAt: new Date("2026-06-16T02:00:00Z") },
      { id: "d2", collectedAt: new Date("2026-06-16T22:00:00Z") },
      { id: "w1", collectedAt: new Date("2025-12-29T00:00:00Z") },
      { id: "w2", collectedAt: new Date("2026-01-04T00:00:00Z") },
    ];
    const { keep, remove } = planDownsample(snaps, NOW);
    expect([...keep, ...remove].sort()).toEqual(snaps.map((s) => s.id).sort());
    expect(keep.filter((id) => remove.includes(id))).toEqual([]);
  });

  it("handles an empty input", () => {
    expect(planDownsample([], NOW)).toEqual({ keep: [], remove: [] });
  });

  it("honors a custom policy", () => {
    // A 1-day hourly window: the 2-day-old snapshot drops into daily bucketing.
    const snaps = [snap("fresh", 0.5), snap("older", 2)];
    const plan = planDownsample(snaps, NOW, { hourlyDays: 1, dailyDays: 90 });
    expect(plan.keep.sort()).toEqual(["fresh", "older"]); // sole snapshot in its day
    expect(plan.remove).toEqual([]);
  });
});
