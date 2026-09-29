/**
 * Update/relaunch impact (Task #63): average players in the hours before a
 * game's Roblox "last updated" timestamp vs. the same span after it.
 *
 * Observational, not causal. Both windows are whole days, so the daily cycle
 * cancels out, but the weekly one doesn't (updates often land before weekends,
 * when play rises anyway), and whatever else happened in the window counts too.
 * The per-genre version lives in analytics/update_impact.py and uses the same
 * windows and rules; keep them in step.
 */

/** Before/after spans compared around each update, in hours. */
export const UPDATE_WINDOWS_HOURS = [24, 72] as const;
export type UpdateWindowHours = (typeof UPDATE_WINDOWS_HOURS)[number];

const HOUR_MS = 3_600_000;

export interface ImpactSnapshot {
  collectedAt: Date;
  playing: number;
}

export type UpdateWindowStatus =
  /** Both sides have readings. */
  | "ok"
  /** The after-window hasn't finished yet. */
  | "pending"
  /** No reading on one side (before tracking began, or a collection gap). */
  | "no_data";

export interface UpdateWindowImpact {
  hours: UpdateWindowHours;
  status: UpdateWindowStatus;
  /** Average players in [T − hours, T), or null. */
  before: number | null;
  /** Average players in (T, T + hours], or null. */
  after: number | null;
  nBefore: number;
  nAfter: number;
  /** after ÷ before − 1, or null when not measurable. */
  changePct: number | null;
  /** Another update of the same game falls inside either window, so this one's
   * effect can't be separated from it. */
  overlapped: boolean;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * Measure one update over one window. `snapshots` may be any superset of the
 * window (order doesn't matter); `otherUpdates` are the game's other update
 * times, for the overlap flag; `now` decides whether the window has elapsed.
 */
export function measureUpdateWindow(
  updatedAt: Date,
  hours: UpdateWindowHours,
  snapshots: ImpactSnapshot[],
  otherUpdates: Date[],
  now: Date,
): UpdateWindowImpact {
  const t = updatedAt.getTime();
  const span = hours * HOUR_MS;
  const beforeVals: number[] = [];
  const afterVals: number[] = [];
  for (const s of snapshots) {
    const at = s.collectedAt.getTime();
    if (at >= t - span && at < t) beforeVals.push(s.playing);
    else if (at > t && at <= t + span) afterVals.push(s.playing);
  }
  const before = mean(beforeVals);
  const after = mean(afterVals);
  const overlapped = otherUpdates.some((u) => {
    const d = Math.abs(u.getTime() - t);
    return d > 0 && d < span;
  });

  let status: UpdateWindowStatus;
  if (t + span > now.getTime()) status = "pending";
  else if (before === null || after === null) status = "no_data";
  else status = "ok";

  return {
    hours,
    status,
    before,
    after,
    nBefore: beforeVals.length,
    nAfter: afterVals.length,
    changePct: status === "ok" && before! > 0 ? after! / before! - 1 : null,
    overlapped,
  };
}

export interface UpdateImpact {
  updatedAt: Date;
  windows: UpdateWindowImpact[];
}

/** Every window for each update, newest update first. */
export function measureUpdateImpacts(
  updates: Date[],
  snapshots: ImpactSnapshot[],
  now: Date,
): UpdateImpact[] {
  return [...updates]
    .sort((a, b) => b.getTime() - a.getTime())
    .map((updatedAt) => ({
      updatedAt,
      windows: UPDATE_WINDOWS_HOURS.map((h) =>
        measureUpdateWindow(updatedAt, h, snapshots, updates, now),
      ),
    }));
}

/** The span of snapshots needed to measure `updates` (null if there are none). */
export function impactSnapshotRange(updates: Date[]): { from: Date; to: Date } | null {
  if (updates.length === 0) return null;
  const times = updates.map((u) => u.getTime());
  const span = Math.max(...UPDATE_WINDOWS_HOURS) * HOUR_MS;
  return { from: new Date(Math.min(...times) - span), to: new Date(Math.max(...times) + span) };
}
