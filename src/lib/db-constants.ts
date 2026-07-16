/**
 * String-column value sets for the Prisma schema.
 *
 * The schema avoids native `enum`s so it stays portable across SQLite (local)
 * and Postgres/Turso (hosted). These const arrays + union types give us the
 * type-safety an enum would, without the DB-specific feature. Import these
 * anywhere you read/write the corresponding String columns.
 */

export const CREATOR_TYPES = ["User", "Group"] as const;
export type CreatorType = (typeof CREATOR_TYPES)[number];

/** Game.status — lifecycle per the "dead" rule (<5% of peak for 7+ days). */
export const GAME_STATUSES = ["active", "dead"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/** GameGenreHistory.source — how a genre assignment was decided. */
export const GENRE_SOURCES = ["roblox_tag", "manual", "inferred"] as const;
export type GenreSource = (typeof GENRE_SOURCES)[number];

/** AnalyticsResult.scopeType — what a result is about. */
export const ANALYTICS_SCOPE_TYPES = ["game", "genre", "global"] as const;
export type AnalyticsScopeType = (typeof ANALYTICS_SCOPE_TYPES)[number];

/**
 * AnalyticsResult.kind — one per Phase 4 analytics job. Extend as those land
 * (Tasks #21–#29). Kept as a plain list so the Python jobs and the frontend
 * agree on the string keys.
 */
export const ANALYTICS_KINDS = [
  "survival_km", // Kaplan-Meier survival (Task #21)
  "trend_momentum", // growth/moving-average metrics (Task #22)
  "trajectory_cluster", // player-curve clustering (Task #23)
  "opportunity_score", // demand-vs-supply per genre (Task #24)
  "change_point", // spike/drop detection (Task #25)
  "correlation", // feature importance (Task #26)
  "cohort", // launch-window cohorts (Task #27)
  "seasonality", // day-of-week / holiday effects (Task #28)
  "forecast", // near-term projections (Task #29)
] as const;
export type AnalyticsKind = (typeof ANALYTICS_KINDS)[number];
