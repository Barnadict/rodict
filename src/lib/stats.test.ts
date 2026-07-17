import { describe, it, expect } from "vitest";

import { movingAverage, formatGrowthPct } from "./stats";

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
