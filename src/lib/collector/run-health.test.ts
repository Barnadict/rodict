import { describe, expect, it } from "vitest";

import { effectiveRunStatus, isBrokenCollectRun } from "./run-health";

const run = { persistFailed: false, due: 1000, persisted: 1000, guarded: false };

describe("isBrokenCollectRun", () => {
  it("passes a run that persisted what it was due", () => {
    expect(isBrokenCollectRun(run)).toBe(false);
  });

  it("fails any run whose bulk persist threw, guarded or not", () => {
    expect(isBrokenCollectRun({ ...run, persistFailed: true })).toBe(true);
    expect(isBrokenCollectRun({ ...run, persistFailed: true, guarded: true })).toBe(true);
  });

  it("fails a normal run below the 10% floor; exactly 10% passes", () => {
    expect(isBrokenCollectRun({ ...run, persisted: 99 })).toBe(true);
    expect(isBrokenCollectRun({ ...run, persisted: 100 })).toBe(false);
  });

  it("never applies the floor to a guard-reduced or paused run", () => {
    expect(isBrokenCollectRun({ ...run, persisted: 0, guarded: true })).toBe(false);
    expect(isBrokenCollectRun({ ...run, due: 0, persisted: 0, guarded: true })).toBe(false);
  });

  it("passes a run with nothing due", () => {
    expect(isBrokenCollectRun({ ...run, due: 0, persisted: 0 })).toBe(false);
  });
});

describe("effectiveRunStatus", () => {
  // The two production runs from 2026-09-29/30 that started this task.
  const outage = {
    job: "collect",
    status: "partial",
    error:
      "bulk persist: SQLITE_UNKNOWN: SQLite error: Expression tree is too large (maximum depth 100)",
    summary: JSON.stringify({
      discovered: 0,
      knownReCollected: 2673,
      persisted: 0,
      budgetGuard: "normal",
      writesTotal: 20,
    }),
  };

  it("reads the outage runs as failures", () => {
    expect(effectiveRunStatus(outage)).toBe("failure");
  });

  it("finds the persist error on any line (after a guard reason)", () => {
    expect(effectiveRunStatus({ ...outage, error: `Guard note\n${outage.error}` })).toBe("failure");
  });

  it("uses the recorded `due`, else known + discovered, for the floor", () => {
    const summary = (s: object) => JSON.stringify({ budgetGuard: "normal", ...s });
    const base = { job: "collect", status: "partial", error: "2 API batch(es) skipped" };
    expect(effectiveRunStatus({ ...base, summary: summary({ due: 100, persisted: 5 }) })).toBe(
      "failure",
    );
    expect(
      effectiveRunStatus({
        ...base,
        summary: summary({ knownReCollected: 90, discovered: 10, persisted: 50 }),
      }),
    ).toBe("partial");
  });

  it.each(["reduced", "paced"])("keeps guard-%s partial runs partial", (budgetGuard) => {
    const summary = JSON.stringify({ due: 2000, persisted: 0, budgetGuard });
    expect(effectiveRunStatus({ job: "collect", status: "partial", error: null, summary })).toBe(
      "partial",
    );
  });

  it("leaves other statuses, other jobs and unreadable summaries alone", () => {
    expect(effectiveRunStatus({ ...outage, status: "success" })).toBe("success");
    expect(effectiveRunStatus({ ...outage, job: "analytics" })).toBe("partial");
    expect(
      effectiveRunStatus({ job: "collect", status: "partial", error: "x", summary: "not json" }),
    ).toBe("partial");
  });
});
