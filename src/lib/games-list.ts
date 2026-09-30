/**
 * /games filters and the two sorts the database can't index (Task #70). Kept
 * free of Prisma so they're unit-testable.
 *
 * Like ratio and window growth are computed values, so those sorts rank the
 * filtered games in memory and then load one page: one read of three small
 * columns over the matching games, instead of a stored column the collector
 * would have to keep in sync.
 */

export const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "dead", label: "Dead" },
] as const;
export type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

export function parseStatus(raw: string | undefined): StatusFilter | undefined {
  return STATUS_OPTIONS.find((o) => o.value === raw)?.value;
}

/** Game age by Roblox creation date. `older` = created more than a year ago. */
export const AGE_OPTIONS = [
  { value: "30d", label: "Created ≤30 days ago", days: 30 },
  { value: "90d", label: "Created ≤90 days ago", days: 90 },
  { value: "1y", label: "Created ≤1 year ago", days: 365 },
  { value: "older", label: "Created >1 year ago", days: 365 },
] as const;
export type AgeFilter = (typeof AGE_OPTIONS)[number]["value"];

export function parseAge(raw: string | undefined): AgeFilter | undefined {
  return AGE_OPTIONS.find((o) => o.value === raw)?.value;
}

/** The robloxCreatedAt bounds for an age filter. */
export function ageToCreatedRange(age: AgeFilter, now: Date): { gte?: Date; lt?: Date } {
  const option = AGE_OPTIONS.find((o) => o.value === age)!;
  const bound = new Date(now.getTime() - option.days * 86_400_000);
  return age === "older" ? { lt: bound } : { gte: bound };
}

export const MIN_PLAYERS_OPTIONS = [10, 100, 1_000, 10_000] as const;

export function parseMinPlayers(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return (MIN_PLAYERS_OPTIONS as readonly number[]).includes(n) ? n : undefined;
}

/**
 * Votes a game needs before its like ratio is ranked. Below this a handful of
 * votes decides the ratio (1 like, 0 dislikes = 100%), which would fill the
 * top of the list with tiny games.
 */
export const LIKE_RATIO_MIN_VOTES = 100;

export interface VoteRow {
  id: string;
  currentUpVotes: number;
  currentDownVotes: number;
  currentPlaying: number;
}

/** Game ids ordered by like ratio; games under the vote floor are left out.
 * Ties go to the busier game. */
export function rankByLikeRatio(rows: VoteRow[], order: "asc" | "desc"): string[] {
  const dir = order === "asc" ? 1 : -1;
  return rows
    .filter((r) => r.currentUpVotes + r.currentDownVotes >= LIKE_RATIO_MIN_VOTES)
    .map((r) => ({
      id: r.id,
      ratio: r.currentUpVotes / (r.currentUpVotes + r.currentDownVotes),
      playing: r.currentPlaying,
    }))
    .sort((a, b) => dir * (a.ratio - b.ratio) || b.playing - a.playing)
    .map((r) => r.id);
}

/** Game ids ordered by window growth; games without a growth figure (too
 * little history, or below the baseline floor) are left out. */
export function rankByGrowth(
  rows: { id: string; currentPlaying: number }[],
  growthById: Map<string, number>,
  order: "asc" | "desc",
): string[] {
  const dir = order === "asc" ? 1 : -1;
  return rows
    .filter((r) => growthById.has(r.id))
    .map((r) => ({ id: r.id, growth: growthById.get(r.id)!, playing: r.currentPlaying }))
    .sort((a, b) => dir * (a.growth - b.growth) || b.playing - a.playing)
    .map((r) => r.id);
}
