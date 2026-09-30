import { describe, expect, it } from "vitest";

import type { BudgetReport } from "@/lib/db/write-counts";

import { decideBudgetGuard, paceAllowance } from "./budget-guard";

const CAP = 10_000_000;

function report(
  measuredWritesToDate: number,
  projectedMonthWrites: number | null,
  daysElapsed = 10,
): BudgetReport {
  return {
    monthStart: new Date(Date.UTC(2026, 9, 1)),
    daysInMonth: 31,
    daysElapsed,
    jobs: {},
    measuredWritesToDate,
    tursoRowsWritten: null,
    writesToDate: measuredWritesToDate,
    unmeasuredRuns: 0,
    projectedMonthWrites,
    fullMonthWritesAtSchedule: null,
    fullMonthAnalyticsReadsAtSchedule: null,
  };
}

describe("decideBudgetGuard", () => {
  it("runs normally while the projection is under 85% of the cap", () => {
    const d = decideBudgetGuard(report(1_000_000, 8_499_999), CAP);
    expect(d.mode).toBe("normal");
    expect(d.reason).toBeNull();
  });

  it("drops to busy-tier games once the projection passes 85%", () => {
    const d = decideBudgetGuard(report(3_000_000, 8_500_000), CAP);
    expect(d.mode).toBe("reduced");
    expect(d.reason).toMatch(/85\.0% of the 10,000,000 cap/);
  });

  it("uses the writes so far when there is no projection yet", () => {
    expect(decideBudgetGuard(report(100, null), CAP).mode).toBe("normal");
    expect(decideBudgetGuard(report(9_000_000, null), CAP).mode).toBe("reduced");
  });

  it("pauses once 95% of the cap is already written", () => {
    const d = decideBudgetGuard(report(9_500_000, 9_600_000), CAP);
    expect(d.mode).toBe("paused");
    expect(d.reason).toMatch(/paused until the month resets/);
  });
});

describe("pacing (Task #79)", () => {
  // 10M × 0.9 over 31 days = 290,322.6 rows a day.
  it("allows an even share of 90% of the cap, plus one day of slack", () => {
    expect(paceAllowance(report(0, null, 0), CAP)).toBe(290_323);
    expect(paceAllowance(report(0, null, 10), CAP)).toBe(3_193_548);
    expect(paceAllowance(report(0, null, 31), CAP)).toBe(9_290_323);
  });

  it("skips a paced run that is ahead of the line", () => {
    const d = decideBudgetGuard(report(3_193_549, 4_000_000, 10), CAP, { pace: true });
    expect(d.mode).toBe("paced");
    expect(d.paceAllowance).toBe(3_193_548);
    expect(d.reason).toMatch(/ahead of the 3,193,548 allowed by now/);
  });

  it("runs normally on or under the line", () => {
    expect(decideBudgetGuard(report(3_193_548, 4_000_000, 10), CAP, { pace: true }).mode).toBe(
      "normal",
    );
  });

  it("only paces callers that ask for it", () => {
    expect(decideBudgetGuard(report(5_000_000, 6_000_000, 10), CAP).mode).toBe("normal");
  });

  it("still pauses at 95%, and paces a run that would only be reduced", () => {
    expect(decideBudgetGuard(report(9_500_000, null, 31), CAP, { pace: true }).mode).toBe("paused");
    expect(decideBudgetGuard(report(5_000_000, 9_000_000, 10), CAP, { pace: true }).mode).toBe(
      "paced",
    );
    expect(decideBudgetGuard(report(1_000_000, 9_000_000, 10), CAP, { pace: true }).mode).toBe(
      "reduced",
    );
  });
});
