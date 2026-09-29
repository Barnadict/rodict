import { describe, it, expect } from "vitest";

import {
  movingAverage,
  formatGrowthPct,
  findSeriesGaps,
  SERIES_GAP_DAYS,
  buildProjection,
} from "./stats";

describe("movingAverage", () => {
  it("averages the trailing window once enough points exist", () => {
    // index 2 = (1+2+3)/3, index 3 = (2+3+4)/3, index 4 = (3+4+5)/3
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
  });

  it("uses a shrinking window near the start rather than emitting nulls", () => {
    // Charts plot this directly, so a leading gap would break the line; the
    // series degrades to the raw values instead.
    const out = movingAverage([10, 20], 5);
    expect(out).toEqual([10, 15]);
  });

  it("is trailing, never peeking at future points", () => {
    // A centered average would leak later values into earlier ones and make a
    // climb look like it started before it did.
    const out = movingAverage([0, 0, 0, 100], 4);
    expect(out[0]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(25);
  });

  it("returns a copy of the input for a window of 1 or less", () => {
    const input = [1, 2, 3];
    expect(movingAverage(input, 1)).toEqual(input);
    expect(movingAverage(input, 0)).toEqual(input);
    expect(movingAverage(input, 1)).not.toBe(input); // a copy, not the same array
  });

  it("handles an empty series", () => {
    expect(movingAverage([], 3)).toEqual([]);
  });

  it("preserves a flat series exactly", () => {
    expect(movingAverage([5, 5, 5, 5], 3)).toEqual([5, 5, 5, 5]);
  });
});

describe("formatGrowthPct", () => {
  it("renders positive growth with a plus sign", () => {
    expect(formatGrowthPct(0.12)).toBe("+12%");
    expect(formatGrowthPct(0.609)).toBe("+60.9%");
  });

  it("renders negative growth with a minus sign", () => {
    // U+2212 MINUS SIGN, not an ASCII hyphen — it aligns in tabular figures.
    expect(formatGrowthPct(-0.05)).toBe("−5%");
  });

  it("renders zero without a sign", () => {
    expect(formatGrowthPct(0)).toBe("0%");
  });

  it("renders null as an em dash", () => {
    // "no data" must not read as 0% growth.
    expect(formatGrowthPct(null)).toBe("—");
  });

  it("rounds to one decimal place", () => {
    expect(formatGrowthPct(0.12345)).toBe("+12.3%");
  });

  it("handles growth above 100%", () => {
    expect(formatGrowthPct(2.5)).toBe("+250%");
  });
});

describe("findSeriesGaps", () => {
  const DAY = 86_400_000;

  it("finds only pauses longer than the gap threshold", () => {
    const t = [0, DAY, 2 * DAY, 2 * DAY + (SERIES_GAP_DAYS + 1) * DAY, 3 * DAY + 5 * DAY];
    expect(findSeriesGaps(t)).toEqual([{ from: 2 * DAY, to: t[3] }]);
  });

  it("treats a pause of exactly the threshold as continuous", () => {
    expect(findSeriesGaps([0, SERIES_GAP_DAYS * DAY])).toEqual([]);
  });

  it("handles empty and single-point series", () => {
    expect(findSeriesGaps([])).toEqual([]);
    expect(findSeriesGaps([5])).toEqual([]);
  });
});

describe("buildProjection", () => {
  const H = 3_600_000;
  const t0 = Date.parse("2026-09-29T00:00:00.000Z");
  const series = [0, 1, 2, 3].map((i) => ({ t: t0 + i * 3 * H, value: 100 + i }));
  const points = [1, 2, 3].map((step) => ({
    step,
    forecast: 110 + step,
    lower: 100 + step,
    upper: 120 + step,
  }));

  it("starts at the fitted point with no band and steps by stepHours", () => {
    const out = buildProjection(
      { lastAt: "2026-09-29T09:00:00.000Z", stepHours: 3, lastValue: 103, points },
      series,
    );
    expect(out.map((p) => (p.t - t0) / H)).toEqual([9, 12, 15, 18]);
    expect(out[0]).toMatchObject({ forecast: 103, lower: 103, upper: 103 });
    expect(out[1]).toMatchObject({ forecast: 111, lower: 101, upper: 121 });
  });

  it("drops steps the real data has already passed", () => {
    const out = buildProjection(
      { lastAt: "2026-09-29T03:00:00.000Z", stepHours: 3, lastValue: 101, points },
      series,
    );
    // Anchor at 3h; steps at 6h and 9h are covered by real points; 12h remains.
    expect(out.map((p) => (p.t - t0) / H)).toEqual([3, 12]);
  });

  it("snaps an anchor that falls between real points onto the nearest one", () => {
    const out = buildProjection(
      { lastAt: "2026-09-29T04:00:00.000Z", stepHours: 6, points },
      series,
    );
    expect((out[0].t - t0) / H).toBe(3);
  });

  it("falls back to the last point and its spacing for older payloads", () => {
    const out = buildProjection({ points }, series);
    expect(out.map((p) => (p.t - t0) / H)).toEqual([9, 12, 15, 18]);
    expect(out[0].forecast).toBe(103);
  });

  it("returns nothing when every step is already in the past", () => {
    const out = buildProjection(
      { lastAt: "2026-09-29T00:00:00.000Z", stepHours: 1, points },
      series,
    );
    expect(out).toEqual([]);
  });
});
