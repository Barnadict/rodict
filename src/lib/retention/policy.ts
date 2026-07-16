/**
 * Retention / downsampling policy (Task #11). Keeps the free-tier DB within
 * size limits while preserving enough resolution for the analytics:
 *
 *   - age <= 7 days   : keep everything (full hourly resolution)
 *   - 7..90 days      : keep one snapshot per UTC day
 *   - > 90 days       : keep one snapshot per ISO week
 *
 * Within each bucket we keep the MOST RECENT snapshot (end-of-period value).
 * All-time peak lives on Game (not recomputed from snapshots), so downsampling
 * never loses a game's peak — the "dead" rule stays intact. The job is
 * idempotent: re-running converges to the same kept set.
 */

export interface RetentionPolicy {
  /** Keep everything newer than this many days. */
  hourlyDays: number;
  /** Between hourlyDays and this many days, keep one per day. Older: one per week. */
  dailyDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  hourlyDays: 7,
  dailyDays: 90,
};

const DAY_MS = 86_400_000;

/** UTC calendar-day key, e.g. "2026-07-16". */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO week key, e.g. "2026-W29" (weeks start Monday, ISO-8601). */
export function isoWeekKey(d: Date): string {
  // Copy to a UTC date at midnight.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of the current ISO week determines the ISO year.
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export interface SnapshotRef {
  id: string;
  collectedAt: Date;
}

export interface DownsamplePlan {
  keep: string[];
  remove: string[];
}

/**
 * Pure planner: given one game's snapshots, decide which ids to keep vs remove
 * under the policy. `now` is injectable for testing/determinism.
 */
export function planDownsample(
  snapshots: SnapshotRef[],
  now: Date = new Date(),
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): DownsamplePlan {
  const hourlyCutoff = now.getTime() - policy.hourlyDays * DAY_MS;
  const dailyCutoff = now.getTime() - policy.dailyDays * DAY_MS;

  const keep: string[] = [];
  const remove: string[] = [];
  // bucketKey -> the currently-kept snapshot for that bucket
  const kept = new Map<string, SnapshotRef>();

  for (const snap of snapshots) {
    const t = snap.collectedAt.getTime();

    if (t >= hourlyCutoff) {
      keep.push(snap.id); // within the hourly window — always kept
      continue;
    }

    const bucket =
      t >= dailyCutoff ? `D:${utcDayKey(snap.collectedAt)}` : `W:${isoWeekKey(snap.collectedAt)}`;

    const incumbent = kept.get(bucket);
    if (!incumbent) {
      kept.set(bucket, snap);
    } else if (t > incumbent.collectedAt.getTime()) {
      // newer snapshot wins the bucket; evict the older one
      remove.push(incumbent.id);
      kept.set(bucket, snap);
    } else {
      remove.push(snap.id);
    }
  }

  for (const snap of kept.values()) keep.push(snap.id);
  return { keep, remove };
}
