import { describe, it, expect } from "vitest";

import { getDevExRate, robuxToUsd } from "./devex";

/**
 * The DevEx rate is the single conversion every money figure on the site passes
 * through, and it's date-aware so historical snapshots use the rate in effect
 * then. That makes the schedule boundaries the highest-value thing to pin down:
 * an off-by-one there silently misprices a whole era of history.
 */
describe("getDevExRate", () => {
  it("returns the legacy rate before the 2025-09-05 change", () => {
    expect(getDevExRate(new Date("2025-09-04T23:59:59Z"))).toBe(0.0035);
  });

  it("returns the new rate exactly at the change instant (boundary is inclusive)", () => {
    expect(getDevExRate(new Date("2025-09-05T00:00:00Z"))).toBe(0.0038);
  });

  it("returns the new rate after the change", () => {
    expect(getDevExRate(new Date("2026-01-01T00:00:00Z"))).toBe(0.0038);
  });

  it("returns the legacy rate for dates before the whole schedule", () => {
    expect(getDevExRate(new Date("1999-01-01T00:00:00Z"))).toBe(0.0035);
  });

  it("defaults to the standard tier, not the higher US-18+ one", () => {
    // Guards against the premium tier silently becoming the default and
    // inflating every estimate by ~42%.
    expect(getDevExRate(new Date("2026-07-01T00:00:00Z"))).toBe(0.0038);
  });

  describe("us18Plus tier", () => {
    it("returns the premium rate on/after 2026-06-08", () => {
      expect(getDevExRate(new Date("2026-06-08T00:00:00Z"), "us18Plus")).toBe(0.0054);
      expect(getDevExRate(new Date("2026-12-01T00:00:00Z"), "us18Plus")).toBe(0.0054);
    });

    it("falls back to the tier's earliest rate for dates predating it", () => {
      // Documented fallback: the tier's schedule has no earlier entry, so a date
      // before it yields the earliest known rate rather than throwing. Asserted
      // so the behavior is a decision, not an accident.
      expect(getDevExRate(new Date("2020-01-01T00:00:00Z"), "us18Plus")).toBe(0.0054);
    });
  });
});

describe("robuxToUsd", () => {
  it("multiplies by the rate in effect on the given date", () => {
    expect(robuxToUsd(1000, new Date("2026-01-01T00:00:00Z"))).toBeCloseTo(3.8, 10);
    expect(robuxToUsd(1000, new Date("2025-01-01T00:00:00Z"))).toBeCloseTo(3.5, 10);
  });

  it("converts zero to zero", () => {
    expect(robuxToUsd(0, new Date("2026-01-01T00:00:00Z"))).toBe(0);
  });

  it("honors the tier argument", () => {
    expect(robuxToUsd(1000, new Date("2026-07-01T00:00:00Z"), "us18Plus")).toBeCloseTo(5.4, 10);
  });
});
