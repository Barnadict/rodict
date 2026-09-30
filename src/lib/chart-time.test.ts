import { describe, expect, it } from "vitest";

import { COLLECTION_GAP, overlapsCollectionGap, syncByTime, toEpochMs } from "./chart-time";

describe("toEpochMs", () => {
  it("reads epoch numbers, numeric strings and ISO dates", () => {
    expect(toEpochMs(1000)).toBe(1000);
    expect(toEpochMs("1000")).toBe(1000);
    expect(toEpochMs("2026-10-01")).toBe(Date.UTC(2026, 9, 1));
  });
});

describe("syncByTime", () => {
  const day = (d: number) => Date.UTC(2026, 9, d);
  const ticks = [{ value: "2026-10-01" }, { value: "2026-10-02" }, { value: "2026-10-03" }];

  it("picks the nearest tick in time", () => {
    const label = String(day(2) + 5 * 3_600_000);
    expect(syncByTime(ticks, { activeLabel: label })).toBe(1);
  });

  it("hides the tooltip when nothing is close", () => {
    expect(syncByTime(ticks, { activeLabel: String(day(20)) })).toBe(-1);
  });

  it("ignores labels that aren't times", () => {
    expect(syncByTime(ticks, { activeLabel: "w3" })).toBe(-1);
    expect(syncByTime(ticks, { activeLabel: undefined })).toBe(-1);
  });
});

describe("overlapsCollectionGap", () => {
  it("is true only for spans touching the outage", () => {
    expect(overlapsCollectionGap(COLLECTION_GAP.from - 1, COLLECTION_GAP.from + 1)).toBe(true);
    expect(overlapsCollectionGap(COLLECTION_GAP.to + 1, COLLECTION_GAP.to + 2)).toBe(false);
  });
});
