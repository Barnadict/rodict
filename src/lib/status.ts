/**
 * Pure helpers for the /status page (Task #73): per-job run health from
 * `JobRun` rows and collection coverage shares. No DB access, so they're
 * unit-tested directly.
 */

/** How far back the per-job health tiles look. */
export const STATUS_WINDOW_DAYS = 7;

/** The pipelines the page reports on, in display order. */
export const STATUS_JOBS = ["collect", "analytics", "gamepasses"] as const;

export interface StatusRun {
  id: string;
  job: string;
  status: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  /** Rows written, from `summary.writesTotal` (recorded since Task #42), else null. */
  writesTotal: number | null;
  error: string | null;
}

export interface JobHealth {
  job: string;
  runs: number;
  success: number;
  partial: number;
  failure: number;
  /** Median duration of the window's runs, or null with none. */
  medianDurationMs: number | null;
  /** Newest run in the window, whatever its outcome. */
  lastRun: StatusRun | null;
  /** Newest run in the window that succeeded fully or partially. */
  lastSuccess: StatusRun | null;
}

/** `writesTotal` from a JobRun summary; null when missing or unparseable. */
export function parseWritesTotal(summary: string | null): number | null {
  if (!summary) return null;
  try {
    const parsed: unknown = JSON.parse(summary);
    const writes = (parsed as { writesTotal?: unknown } | null)?.writesTotal;
    return typeof writes === "number" && Number.isFinite(writes) ? writes : null;
  } catch {
    return null;
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Per-job outcome counts for `runs` (any order), one entry per job in `jobs`. */
export function summarizeJobHealth(runs: StatusRun[], jobs: readonly string[]): JobHealth[] {
  return jobs.map((job) => {
    const mine = runs
      .filter((r) => r.job === job)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const count = (status: string) => mine.filter((r) => r.status === status).length;
    return {
      job,
      runs: mine.length,
      success: count("success"),
      partial: count("partial"),
      failure: count("failure"),
      medianDurationMs: median(mine.map((r) => r.durationMs)),
      lastRun: mine[0] ?? null,
      lastSuccess: mine.find((r) => r.status === "success" || r.status === "partial") ?? null,
    };
  });
}

/** `part / total` as a 0–1 share, or null when there's nothing to divide. */
export function share(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

/** "1h 4m", "2m 16s", "850ms". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

/** 0.0734 -> "7.3%"; null -> "—". */
export function formatShare(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}
