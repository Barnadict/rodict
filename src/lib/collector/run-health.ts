/**
 * When a collect run counts as broken (Task #75). Pure, so it's unit-tested.
 *
 * On 2026-09-29/30 two collect runs saved 21 rows instead of ~10K (the bulk
 * persist threw on Turso's expression-depth cap). They were recorded as
 * `partial`, which neither alerts nor turns the footer red, so nobody was
 * told. A run is now a failure when either:
 *   - the bulk persist step threw, or
 *   - it persisted under `COLLECT_PERSIST_FLOOR` of the games it was due to
 *     collect, with the write-budget guard not holding it back.
 * A run the guard (Task #47) reduced or paused is expected to write little, so
 * the floor never applies to it: it stays `partial` and doesn't alert.
 */

/** Below this share of due games persisted, a normal run is treated as failed. */
export const COLLECT_PERSIST_FLOOR = 0.1;

/** `JobRun.error` prefix for a bulk-persist exception (see collect.ts). */
export const BULK_PERSIST_ERROR_PREFIX = "bulk persist:";

export interface CollectRunFacts {
  /** The bulk persist step threw. */
  persistFailed: boolean;
  /** Games the run set out to collect. */
  due: number;
  persisted: number;
  /** The budget guard reduced or paused the run. */
  guarded: boolean;
}

export function isBrokenCollectRun(run: CollectRunFacts): boolean {
  if (run.persistFailed) return true;
  if (run.guarded || run.due <= 0) return false;
  return run.persisted / run.due < COLLECT_PERSIST_FLOOR;
}

/** A `JobRun` row, as far as judging its outcome needs. */
export interface RecordedRun {
  job: string;
  status: string;
  summary: string | null;
  error: string | null;
}

/**
 * The status a recorded run should be shown and alerted as. Runs recorded
 * since #75 already carry `failure` when broken. This also catches the older
 * `partial` rows, so the footer and /status judge history the same way.
 */
export function effectiveRunStatus(run: RecordedRun): string {
  if (run.job !== "collect" || run.status !== "partial") return run.status;
  const facts = collectFactsFromRow(run);
  return facts && isBrokenCollectRun(facts) ? "failure" : run.status;
}

function collectFactsFromRow(run: RecordedRun): CollectRunFacts | null {
  const persistFailed = (run.error ?? "")
    .split("\n")
    .some((line) => line.startsWith(BULK_PERSIST_ERROR_PREFIX));
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = run.summary ? JSON.parse(run.summary) : null;
    if (value && typeof value === "object") parsed = value as Record<string, unknown>;
  } catch {
    // Unparseable summary: only the error text can be judged.
  }
  const num = (key: string) => (typeof parsed[key] === "number" ? (parsed[key] as number) : null);
  const persisted = num("persisted");
  // `due` is recorded since #75; older runs had known + newly discovered ids.
  const due = num("due") ?? ((num("knownReCollected") ?? 0) + (num("discovered") ?? 0) || null);
  if (!persistFailed && (persisted === null || due === null)) return null;
  const guard = parsed.budgetGuard;
  return {
    persistFailed,
    due: due ?? 0,
    persisted: persisted ?? 0,
    guarded: guard === "reduced" || guard === "paused",
  };
}
