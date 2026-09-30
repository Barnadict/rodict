import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatShare,
  parseWritesTotal,
  share,
  summarizeJobHealth,
  type StatusRun,
} from "./status";

function run(over: Partial<StatusRun> & { job: string; status: string; at: string }): StatusRun {
  const startedAt = new Date(over.at);
  const durationMs = over.durationMs ?? 60_000;
  return {
    id: `${over.job}-${over.at}`,
    job: over.job,
    status: over.status,
    startedAt,
    finishedAt: new Date(startedAt.getTime() + durationMs),
    durationMs,
    writesTotal: over.writesTotal ?? null,
    error: over.error ?? null,
  };
}

describe("parseWritesTotal", () => {
  it("reads a numeric writesTotal", () => {
    expect(parseWritesTotal(JSON.stringify({ writesTotal: 10494 }))).toBe(10494);
  });
  it("is null for missing, non-numeric or broken summaries", () => {
    expect(parseWritesTotal(null)).toBeNull();
    expect(parseWritesTotal(JSON.stringify({ persisted: 3 }))).toBeNull();
    expect(parseWritesTotal(JSON.stringify({ writesTotal: "12" }))).toBeNull();
    expect(parseWritesTotal("{not json")).toBeNull();
    expect(parseWritesTotal("null")).toBeNull();
  });
});

describe("summarizeJobHealth", () => {
  const runs = [
    run({ job: "collect", status: "success", at: "2026-09-30T00:00:00Z", durationMs: 100 }),
    run({ job: "collect", status: "failure", at: "2026-09-30T06:00:00Z", durationMs: 300 }),
    run({ job: "collect", status: "partial", at: "2026-09-30T03:00:00Z", durationMs: 200 }),
    run({ job: "analytics", status: "success", at: "2026-09-30T00:50:00Z", durationMs: 50 }),
  ];

  it("counts outcomes and picks the newest run and newest success per job", () => {
    const [collect, analytics, gamepasses] = summarizeJobHealth(runs, [
      "collect",
      "analytics",
      "gamepasses",
    ]);
    expect(collect).toMatchObject({ runs: 3, success: 1, partial: 1, failure: 1 });
    expect(collect.lastRun?.status).toBe("failure");
    // A partial run still delivered data, so it counts as the last success.
    expect(collect.lastSuccess?.status).toBe("partial");
    expect(collect.medianDurationMs).toBe(200);
    expect(analytics).toMatchObject({ runs: 1, success: 1, medianDurationMs: 50 });
    expect(gamepasses).toMatchObject({
      runs: 0,
      lastRun: null,
      lastSuccess: null,
      medianDurationMs: null,
    });
  });

  it("averages the middle pair for an even count", () => {
    const [h] = summarizeJobHealth(runs.slice(0, 2), ["collect"]);
    expect(h.medianDurationMs).toBe(200);
  });
});

describe("share / formatShare", () => {
  it("guards against an empty total", () => {
    expect(share(3, 0)).toBeNull();
    expect(formatShare(null)).toBe("—");
  });
  it("formats to one decimal", () => {
    expect(formatShare(share(1, 8))).toBe("12.5%");
  });
});

describe("formatDuration", () => {
  it("picks sensible units", () => {
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(136_000)).toBe("2m 16s");
    expect(formatDuration(3_840_000)).toBe("1h 4m");
  });
});
