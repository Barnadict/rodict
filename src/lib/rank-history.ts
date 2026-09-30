/**
 * Rank history (Task #90): a game's overall and in-genre rank by daily average
 * players. analytics/rank_ladder.py stores each day's ladder (every genre's
 * sorted daily averages); this works out the game's own daily averages from its
 * snapshots and counts how many games beat it. Pure, so it's tested without a
 * database.
 *
 * Must agree with the Python side exactly, or a game would be ranked below its
 * own ladder entry: same UTC days, only readings up to the day's `until`, and
 * the same rounding (Math.round, which is floor(x + 0.5) in rank_ladder.py).
 */

import type { RankLadder } from "@/lib/db/analytics";

/** Ladder key for games without a genre; same as UNCLASSIFIED in rank_ladder.py. */
export const UNCLASSIFIED_KEY = "_";

export interface RankReading {
  /** Epoch ms. */
  t: number;
  playing: number;
}

export interface RankPoint {
  /** ISO timestamp of the UTC day's midnight. */
  date: string;
  /** Rounded daily average players. */
  value: number;
  overall: number | null;
  overallOf: number;
  genre: number | null;
  genreOf: number;
}

/** Games in a descending ladder with a value strictly above `value`. */
export function countAbove(desc: number[], value: number): number {
  let lo = 0;
  let hi = desc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (desc[mid] > value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The game's rank on one day's ladder, or nulls when its daily average is
 * under the ladder's floor (it isn't on the ladder, so its rank is unknown).
 */
export function rankOnLadder(
  value: number,
  genreKey: string,
  ladder: RankLadder,
): Pick<RankPoint, "overall" | "overallOf" | "genre" | "genreOf"> {
  const overallOf = Object.values(ladder.n).reduce((a, b) => a + b, 0);
  const genreOf = ladder.n[genreKey] ?? 0;
  if (value < ladder.minPlayers) return { overall: null, overallOf, genre: null, genreOf };
  let above = 0;
  for (const values of Object.values(ladder.v)) above += countAbove(values, value);
  return {
    overall: above + 1,
    overallOf,
    genre: countAbove(ladder.v[genreKey] ?? [], value) + 1,
    genreOf,
  };
}

/**
 * One point per ladder day on which the game has readings. A day is skipped
 * when `from` falls inside it: the game's readings for that day would be cut
 * short, so its average wouldn't match the ladder's.
 */
export function rankHistory(
  readings: RankReading[],
  ladders: RankLadder[],
  genreKey: string,
  from?: Date,
): RankPoint[] {
  const points: RankPoint[] = [];
  const byDay = new Map<string, RankReading[]>();
  for (const r of readings) {
    const day = new Date(r.t).toISOString().slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(r);
    byDay.set(day, list);
  }
  for (const ladder of ladders) {
    const dayStart = Date.parse(`${ladder.day}T00:00:00Z`);
    if (from && from.getTime() > dayStart) continue;
    const until = ladder.until.getTime();
    const counted = (byDay.get(ladder.day) ?? []).filter((r) => r.t <= until);
    if (counted.length === 0) continue;
    let sum = 0;
    for (const r of counted) sum += r.playing;
    const value = Math.round(sum / counted.length);
    points.push({
      date: new Date(dayStart).toISOString(),
      value,
      ...rankOnLadder(value, genreKey, ladder),
    });
  }
  return points;
}

/** Best (lowest) rank in the history, ignoring days off the ladder. */
export function bestRank(points: RankPoint[], key: "overall" | "genre"): number | null {
  let best: number | null = null;
  for (const p of points) {
    const r = p[key];
    if (r !== null && (best === null || r < best)) best = r;
  }
  return best;
}

export interface RankRow {
  /** ISO timestamp of the UTC day's midnight. */
  date: string;
  overall: number | null;
  genre: number | null;
}

/**
 * One chart row per UTC day from the first point to the last; days without a
 * point are null, so the lines break across a pause instead of bridging it.
 */
export function rankRows(points: RankPoint[]): RankRow[] {
  if (points.length === 0) return [];
  const byDate = new Map(points.map((p) => [p.date, p]));
  const first = Date.parse(points[0].date);
  const last = Date.parse(points.at(-1)!.date);
  const rows: RankRow[] = [];
  for (let t = first; t <= last; t += 86_400_000) {
    const date = new Date(t).toISOString();
    const p = byDate.get(date);
    rows.push({ date, overall: p?.overall ?? null, genre: p?.genre ?? null });
  }
  return rows;
}
