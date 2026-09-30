/**
 * Engagement ratios (Task #82). Pure, so it's tested without a database.
 *
 * Est. session length uses Little's law: in a steady state, the average number
 * of people in a system (L, concurrent players) equals the arrival rate (λ,
 * visits per hour) times the average time each one stays (W). So
 * W = L / λ = player-hours / visits over the same span. Roblox's visit counter
 * counts joins, so this is the average time per join, not per person per day.
 *
 * Each pair of consecutive readings contributes its player-hours (trapezoid:
 * mean of the two readings × hours between them) and its visit delta. A pair
 * only counts when the readings are close enough together to describe the same
 * stretch of play, and the visit counter didn't go backwards. The estimate is
 * shown only when the counted pairs cover enough hours and enough visits.
 */

export const SESSION_ESTIMATE = {
  /** Readings from the latest this many hours are used: one full daily cycle,
   * so a busy evening doesn't stand in for the whole day. */
  windowHours: 24,
  /** Pairs closer than this are skipped: the visit counter moves in steps. */
  minGapHours: 1,
  /** Pairs further apart than this are skipped: a missed run or an outage. */
  maxGapHours: 8,
  /** Counted pairs must add up to at least this many hours… */
  minCoveredHours: 12,
  /** …and at least this many visits, or there's no estimate. */
  minVisits: 1_000,
} as const;

/** Visits a game needs before favorites per 1K visits is shown. */
export const FAVORITES_MIN_VISITS = 1_000;

const HOUR_MS = 3_600_000;

export interface EngagementReading {
  /** Epoch ms. */
  t: number;
  playing: number;
  /** Cumulative visits. Numbers are exact up to 2^53, far above any game's count. */
  visits: number;
}

/** Player-hours and visits over the counted pairs of readings. */
export interface SessionSums {
  playerHours: number;
  visits: number;
  hours: number;
}

export const EMPTY_SESSION_SUMS: SessionSums = { playerHours: 0, visits: 0, hours: 0 };

/** Sum the qualifying pairs of one game's readings (any order). */
export function sumSessionPairs(readings: EngagementReading[]): SessionSums {
  const sorted = [...readings].sort((a, b) => a.t - b.t);
  const sums = { ...EMPTY_SESSION_SUMS };
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const hours = (b.t - a.t) / HOUR_MS;
    const visits = b.visits - a.visits;
    if (hours < SESSION_ESTIMATE.minGapHours || hours > SESSION_ESTIMATE.maxGapHours) continue;
    if (visits < 0) continue;
    sums.playerHours += ((a.playing + b.playing) / 2) * hours;
    sums.visits += visits;
    sums.hours += hours;
  }
  return sums;
}

export function addSessionSums(a: SessionSums, b: SessionSums): SessionSums {
  return {
    playerHours: a.playerHours + b.playerHours,
    visits: a.visits + b.visits,
    hours: a.hours + b.hours,
  };
}

/** Est. average minutes per visit, or null when the sums are too thin to mean anything. */
export function sessionMinutes(sums: SessionSums): number | null {
  if (sums.hours < SESSION_ESTIMATE.minCoveredHours) return null;
  if (sums.visits < SESSION_ESTIMATE.minVisits) return null;
  return (sums.playerHours / sums.visits) * 60;
}

/** "42 min", "1.5 h". */
export function formatSessionMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

/** Favorites per 1,000 visits (both cumulative), or null under FAVORITES_MIN_VISITS. */
export function favoritesPer1kVisits(favorites: number, visits: number | bigint): number | null {
  const v = Number(visits);
  if (v < FAVORITES_MIN_VISITS) return null;
  return (favorites / v) * 1000;
}

/** Likes ÷ (likes + dislikes), or null under `minVotes`. */
export function likeRatio(upVotes: number, downVotes: number, minVotes = 1): number | null {
  const votes = upVotes + downVotes;
  return votes >= minVotes && votes > 0 ? upVotes / votes : null;
}

export interface VoteReading {
  t: number;
  upVotes: number;
  downVotes: number;
}

/**
 * Change in like ratio from the first to the last reading that has at least
 * `minVotes` votes, in ratio points (0.012 = +1.2 points). Null with fewer
 * than two such readings.
 */
export function likeRatioTrend(readings: VoteReading[], minVotes: number): number | null {
  const rated = readings
    .filter((r) => r.upVotes + r.downVotes >= minVotes)
    .sort((a, b) => a.t - b.t);
  if (rated.length < 2) return null;
  const first = rated[0];
  const last = rated[rated.length - 1];
  return likeRatio(last.upVotes, last.downVotes)! - likeRatio(first.upVotes, first.downVotes)!;
}

/** Game ids ordered by est. session length; games without one are left out.
 * Ties go to the busier game. */
export function rankBySession(
  rows: { id: string; currentPlaying: number }[],
  minutesById: Map<string, number>,
  order: "asc" | "desc",
): string[] {
  const dir = order === "asc" ? 1 : -1;
  return rows
    .filter((r) => minutesById.has(r.id))
    .map((r) => ({ id: r.id, minutes: minutesById.get(r.id)!, playing: r.currentPlaying }))
    .sort((a, b) => dir * (a.minutes - b.minutes) || b.playing - a.playing)
    .map((r) => r.id);
}
