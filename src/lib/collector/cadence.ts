/**
 * Tiered collection cadence (Task #46).
 *
 * Collecting every tracked game every 3h was the single biggest write cost on
 * Turso's capped free plan (one snapshot + one Game update per game per run),
 * and half the corpus sits below 50 concurrent players, where 3-hourly
 * resolution adds almost nothing. So:
 *
 *   - busy games (>= BUSY_MIN_PLAYING players), and games first seen in the
 *     last NEW_GAME_DAYS days, are collected on every run (every 3h);
 *   - everything else, including dead games, is collected about once a day.
 *
 * This changes collection FREQUENCY only, never SCOPE: every known game is
 * still followed until it dies (the survivorship-bias guard holds). The tier is
 * derived from `currentPlaying` rather than stored, so it costs no writes and
 * adapts automatically: a quiet game that picks up is promoted at its next
 * daily collection (or immediately, if it shows up on an explore chart).
 */

export const COLLECTION_CADENCE = {
  /** At or above this many current players, a game is collected every run. */
  busyMinPlaying: 50,
  /** Games first seen this recently stay at full cadence (they may be launching). */
  newGameDays: 7,
  /** Target gap between collections of a low-activity game. */
  lowIntervalHours: 24,
  /** The collector's cron interval (collect.yml: every 3 hours). */
  runIntervalHours: 3,
} as const;

export type CollectionTier = "busy" | "low";

export interface CadenceGame {
  currentPlaying: number;
  firstSeenAt: Date;
  lastCollectedAt: Date | null;
}

const HOUR_MS = 3_600_000;

export function collectionTier(game: CadenceGame, now: Date): CollectionTier {
  const { busyMinPlaying, newGameDays } = COLLECTION_CADENCE;
  if (game.currentPlaying >= busyMinPlaying) return "busy";
  if (now.getTime() - game.firstSeenAt.getTime() < newGameDays * 24 * HOUR_MS) return "busy";
  return "low";
}

/**
 * Whether a known game should be collected on the run starting at `now`.
 *
 * A low-activity game is due once `lowIntervalHours` minus half a run interval
 * have passed. Runs land every ~3h with start jitter, so a strict 24h check
 * would usually miss the run at the 24h mark and slip to ~27h; the half-interval
 * slack keeps the real cadence at ~24h.
 */
export function isDueForCollection(game: CadenceGame, now: Date): boolean {
  if (game.lastCollectedAt === null) return true;
  if (collectionTier(game, now) === "busy") return true;
  const { lowIntervalHours, runIntervalHours } = COLLECTION_CADENCE;
  const dueAfterMs = (lowIntervalHours - runIntervalHours / 2) * HOUR_MS;
  return now.getTime() - game.lastCollectedAt.getTime() >= dueAfterMs;
}
