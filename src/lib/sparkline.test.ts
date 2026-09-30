import { describe, expect, it } from "vitest";

import { sparkCutoff, sparkDays, toSparkSeries } from "./sparkline";

describe("sparkline days", () => {
  const now = new Date("2026-10-01T05:30:00Z");

  it("covers the last 7 UTC days, oldest first, ending today", () => {
    expect(sparkDays(now)).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
  });

  it("starts at midnight UTC of the first day", () => {
    expect(sparkCutoff(now).toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });
});

describe("toSparkSeries", () => {
  const days = ["2026-09-29", "2026-09-30", "2026-10-01"];

  it("places averages on their day and leaves missing days null", () => {
    const out = toSparkSeries(
      [
        { id: "a", day: "2026-09-29", avg: 10 },
        { id: "a", day: "2026-10-01", avg: 30 },
      ],
      ["a", "b"],
      days,
    );
    expect(out).toEqual({ a: [10, null, 30], b: [null, null, null] });
  });

  it("ignores rows for days or ids outside the request", () => {
    const out = toSparkSeries(
      [
        { id: "a", day: "2026-09-01", avg: 5 },
        { id: "z", day: "2026-10-01", avg: 5 },
      ],
      ["a"],
      days,
    );
    expect(out).toEqual({ a: [null, null, null] });
  });
});
