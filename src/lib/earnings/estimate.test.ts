import { describe, it, expect } from "vitest";

import {
  EARNINGS_ASSUMPTIONS,
  estimateDailyEarningsFromCcu,
  estimateEarningsFromVisitGrowth,
  deriveSnapshotMetrics,
  type SnapshotLike,
} from "./estimate";

const AT = new Date("2026-01-01T00:00:00Z"); // standard tier: 0.0038 USD/Robux

describe("estimateDailyEarningsFromCcu", () => {
  it("computes low/mid/high from the tunable assumptions and the DevEx rate", () => {
    const est = estimateDailyEarningsFromCcu(1000, AT);
    // 1000 CCU x 8 Robux x 0.0038 = 30.4
    expect(est.low).toBeCloseTo(1000 * EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.low * 0.0038, 10);
    expect(est.mid).toBeCloseTo(1000 * EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.mid * 0.0038, 10);
    expect(est.high).toBeCloseTo(1000 * EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.high * 0.0038, 10);
  });

  it("keeps the band ordered low <= mid <= high", () => {
    // The UI renders this as a range; an inverted band would print "$42K–$7K".
    const est = estimateDailyEarningsFromCcu(250_000, AT);
    expect(est.low).toBeLessThan(est.mid);
    expect(est.mid).toBeLessThan(est.high);
  });

  it("always marks itself an estimate", () => {
    // The "Est." badge keys off this — silently losing it would present a guess
    // as a real revenue figure, which the project forbids everywhere.
    const est = estimateDailyEarningsFromCcu(1, AT);
    expect(est.isEstimate).toBe(true);
    expect(est.basis).toBe("ccu");
    expect(est.currency).toBe("USD");
  });

  it("returns a zero band for zero players", () => {
    const est = estimateDailyEarningsFromCcu(0, AT);
    expect(est).toMatchObject({ low: 0, mid: 0, high: 0 });
  });

  it("uses the DevEx rate in effect at the snapshot's date, not today's", () => {
    const legacy = estimateDailyEarningsFromCcu(1000, new Date("2025-01-01T00:00:00Z"));
    const current = estimateDailyEarningsFromCcu(1000, AT);
    expect(legacy.mid).toBeLessThan(current.mid);
    expect(legacy.mid / current.mid).toBeCloseTo(0.0035 / 0.0038, 10);
  });

  it("scales linearly with player count", () => {
    const a = estimateDailyEarningsFromCcu(100, AT);
    const b = estimateDailyEarningsFromCcu(200, AT);
    expect(b.mid).toBeCloseTo(a.mid * 2, 10);
  });
});

describe("estimateEarningsFromVisitGrowth", () => {
  it("normalizes the delta to a per-day figure", () => {
    // 500 visits in 12h = 1000/day.
    const est = estimateEarningsFromVisitGrowth(500, 12, AT);
    expect(est).not.toBeNull();
    expect(est!.mid).toBeCloseTo(1000 * EARNINGS_ASSUMPTIONS.robuxPerVisit.mid * 0.0038, 10);
    expect(est!.basis).toBe("visit-growth");
  });

  it("is unchanged when the delta and window scale together", () => {
    const half = estimateEarningsFromVisitGrowth(500, 12, AT);
    const full = estimateEarningsFromVisitGrowth(1000, 24, AT);
    expect(half!.mid).toBeCloseTo(full!.mid, 10);
  });

  it("returns null for a non-positive window rather than dividing by zero", () => {
    expect(estimateEarningsFromVisitGrowth(100, 0, AT)).toBeNull();
    expect(estimateEarningsFromVisitGrowth(100, -5, AT)).toBeNull();
  });

  it("returns null for a negative delta", () => {
    // Visits are cumulative and can only rise; a negative delta means bad data,
    // not negative earnings.
    expect(estimateEarningsFromVisitGrowth(-1, 24, AT)).toBeNull();
  });

  it("allows a zero delta (a real quiet period, not bad data)", () => {
    const est = estimateEarningsFromVisitGrowth(0, 24, AT);
    expect(est).not.toBeNull();
    expect(est!.mid).toBe(0);
  });
});

// BigInt via the constructor, not `1000n` literals — the project targets ES2017,
// which predates BigInt literal syntax, so all app code writes them this way too.
function snapshot(over: Partial<SnapshotLike> = {}): SnapshotLike {
  return {
    collectedAt: AT,
    playing: 100,
    visits: BigInt(1000),
    upVotes: 90,
    downVotes: 10,
    ...over,
  };
}

describe("deriveSnapshotMetrics", () => {
  it("computes the like ratio", () => {
    const d = deriveSnapshotMetrics(snapshot({ upVotes: 90, downVotes: 10 }));
    expect(d.likeRatio).toBeCloseTo(0.9, 10);
    expect(d.totalVotes).toBe(100);
  });

  it("returns a null like ratio with no votes rather than dividing by zero", () => {
    // A 0/0 game must read "—", not "NaN%" or a misleading 0%.
    const d = deriveSnapshotMetrics(snapshot({ upVotes: 0, downVotes: 0 }));
    expect(d.likeRatio).toBeNull();
    expect(d.totalVotes).toBe(0);
  });

  it("omits the growth estimate without a previous snapshot", () => {
    expect(deriveSnapshotMetrics(snapshot()).estimatedEarningsFromGrowth).toBeNull();
  });

  it("derives the visit-growth estimate from the gap to the previous snapshot", () => {
    const prev = snapshot({
      collectedAt: new Date("2025-12-31T00:00:00Z"),
      visits: BigInt(1000),
    });
    const cur = snapshot({ visits: BigInt(3000) }); // +2000 visits over 24h
    const d = deriveSnapshotMetrics(cur, prev);
    expect(d.estimatedEarningsFromGrowth).not.toBeNull();
    expect(d.estimatedEarningsFromGrowth!.mid).toBeCloseTo(
      2000 * EARNINGS_ASSUMPTIONS.robuxPerVisit.mid * 0.0038,
      10,
    );
  });

  it("suppresses the growth estimate when visits went backwards", () => {
    const prev = snapshot({
      collectedAt: new Date("2025-12-31T00:00:00Z"),
      visits: BigInt(5000),
    });
    const cur = snapshot({ visits: BigInt(4000) });
    expect(deriveSnapshotMetrics(cur, prev).estimatedEarningsFromGrowth).toBeNull();
  });

  it("takes an accurate delta across visit counts too big for a 32-bit Int", () => {
    // Why visits is BigInt at all: the largest games are past 60 billion, which
    // overflows Int. Realistic magnitudes still sit far below Number's 2^53
    // precision limit, so the internal Number() conversion is safe here.
    const prev = snapshot({
      collectedAt: new Date("2025-12-31T00:00:00Z"),
      visits: BigInt("62756731203"),
    });
    const cur = snapshot({ visits: BigInt("62756741203") }); // +10,000 over 24h
    const d = deriveSnapshotMetrics(cur, prev);
    expect(d.estimatedEarningsFromGrowth!.mid).toBeCloseTo(
      10_000 * EARNINGS_ASSUMPTIONS.robuxPerVisit.mid * 0.0038,
      10,
    );
  });
});
