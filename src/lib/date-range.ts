/**
 * Shared date-range convention for all stats pages (Task #19) — one param
 * name, one set of options, one meaning, so navigating between pages feels
 * like the same control everywhere:
 *
 *   - On a trend chart: bounds how far back the series starts ("all" = full history).
 *   - On a point-in-time leaderboard (genres, saturation): "as of N days ago"
 *     ("all" = the current/latest state — no historical restriction).
 *   - On a growth board (trending, games-list Δ column): the comparison window
 *     ("all" = compare the earliest-ever snapshot to the latest).
 *
 * All three readings reduce to the same cutoff computation — only the caller's
 * interpretation differs.
 */

export const RANGE_KEYS = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_OPTIONS = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
] as const satisfies readonly { value: RangeKey; label: string }[];

/** The param value that means "no restriction" — clears the query param. */
export const RANGE_CLEAR_VALUE: RangeKey = "all";

const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const DAY_MS = 86_400_000;

export function isRangeKey(value: string | undefined): value is RangeKey {
  return !!value && (RANGE_KEYS as readonly string[]).includes(value);
}

/** Parse a raw query-string value into a RangeKey, defaulting to "all". */
export function parseRangeKey(raw: string | undefined): RangeKey {
  return isRangeKey(raw) ? raw : "all";
}

/**
 * The cutoff Date for a range key, or undefined for "all" (no restriction).
 * `now` is injectable for deterministic testing.
 */
export function rangeToCutoff(key: RangeKey, now: Date = new Date()): Date | undefined {
  if (key === "all") return undefined;
  return new Date(now.getTime() - RANGE_DAYS[key] * DAY_MS);
}
