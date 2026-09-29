import { describe, it, expect } from "vitest";

import {
  impactSnapshotRange,
  measureUpdateImpacts,
  measureUpdateWindow,
  type ImpactSnapshot,
} from "./update-impact";

const T = new Date("2026-07-20T12:00:00Z");
const hoursFrom = (h: number) => new Date(T.getTime() + h * 3_600_000);
const snap = (h: number, playing: number): ImpactSnapshot => ({
  collectedAt: hoursFrom(h),
  playing,
});
const LATER = hoursFrom(24 * 30);

describe("measureUpdateWindow", () => {
  it("averages each side and reports the relative change", () => {
    const snaps = [snap(-30, 999), snap(-20, 100), snap(-5, 200), snap(3, 300), snap(20, 300)];
    const w = measureUpdateWindow(T, 24, snaps, [T], LATER);
    expect(w).toMatchObject({ status: "ok", before: 150, after: 300, nBefore: 2, nAfter: 2 });
    expect(w.changePct).toBeCloseTo(1);
    expect(w.overlapped).toBe(false);
  });

  it("leaves a reading at the update instant out of both sides", () => {
    const w = measureUpdateWindow(T, 24, [snap(-1, 100), snap(0, 5000), snap(1, 100)], [], LATER);
    expect(w.before).toBe(100);
    expect(w.after).toBe(100);
  });

  it("is pending until the after-window has elapsed", () => {
    const w = measureUpdateWindow(T, 72, [snap(-1, 100), snap(1, 100)], [], hoursFrom(48));
    expect(w.status).toBe("pending");
    expect(w.changePct).toBeNull();
  });

  it("reports no_data when one side has no readings", () => {
    const w = measureUpdateWindow(T, 24, [snap(1, 100), snap(5, 120)], [], LATER);
    expect(w.status).toBe("no_data");
    expect(w.changePct).toBeNull();
  });

  it("has no change when the before-average is zero", () => {
    const w = measureUpdateWindow(T, 24, [snap(-1, 0), snap(1, 10)], [], LATER);
    expect(w.status).toBe("ok");
    expect(w.changePct).toBeNull();
  });

  it("flags another update inside the window, but not one outside it", () => {
    const snaps = [snap(-1, 100), snap(1, 100)];
    expect(measureUpdateWindow(T, 24, snaps, [T, hoursFrom(30)], LATER).overlapped).toBe(false);
    expect(measureUpdateWindow(T, 72, snaps, [T, hoursFrom(30)], LATER).overlapped).toBe(true);
    expect(measureUpdateWindow(T, 24, snaps, [hoursFrom(-10)], LATER).overlapped).toBe(true);
  });
});

describe("measureUpdateImpacts", () => {
  it("measures every window per update, newest first", () => {
    const later = hoursFrom(200);
    const out = measureUpdateImpacts([T, later], [snap(-1, 1), snap(1, 2)], LATER);
    expect(out.map((u) => u.updatedAt)).toEqual([later, T]);
    expect(out[0].windows.map((w) => w.hours)).toEqual([24, 72]);
  });
});

describe("impactSnapshotRange", () => {
  it("spans the widest window around the oldest and newest update", () => {
    expect(impactSnapshotRange([])).toBeNull();
    expect(impactSnapshotRange([hoursFrom(100), T])).toEqual({
      from: hoursFrom(-72),
      to: hoursFrom(172),
    });
  });
});
