import { describe, expect, it } from "vitest";

import type { BudgetReport } from "@/lib/db/write-counts";

import { decideBudgetGuard } from "./budget-guard";

const CAP = 10_000_000;

function report(measuredWritesToDate: number, projectedMonthWrites: number | null): BudgetReport {
  return {
    monthStart: new Date(Date.UTC(2026, 9, 1)),
    daysInMonth: 31,
    daysElapsed: 10,
    jobs: {},
    measuredWritesToDate,
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
