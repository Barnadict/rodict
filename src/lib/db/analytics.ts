import { prisma } from "@/lib/prisma";
import { getLastSuccessfulRun } from "@/lib/db/job-runs";

/**
 * Read side for the precomputed Phase 4 analytics (AnalyticsResult table,
 * written by the Python jobs in analytics/). Payloads are JSON strings; these
 * helpers parse them into typed shapes. The frontend only READS — nothing here
 * computes analytics.
 */

async function getPayload<T>(
  kind: string,
  scopeType: string,
  scopeId: string | null,
): Promise<T | null> {
  const row = await prisma.analyticsResult.findFirst({
    where: { kind, scopeType, scopeId },
    orderBy: { computedAt: "desc" },
  });
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

// --- Opportunity score (Task #24) ---

export interface OpportunityRankingEntry {
  genreId: string;
  slug: string | null;
  name: string | null;
  score: number;
  rank: number;
}
export interface OpportunityRanking {
  weights: Record<string, number>;
  ranking: OpportunityRankingEntry[];
}
export interface OpportunityGenre {
  score: number;
  rank: number;
  components: {
    totalPlaying: number;
    gameCount: number;
    playersPerGame: number;
    growth7d: number;
  };
}

export function getOpportunityRanking() {
  return getPayload<OpportunityRanking>("opportunity_score", "global", null);
}
export function getOpportunityForGenre(genreId: string) {
  return getPayload<OpportunityGenre>("opportunity_score", "genre", genreId);
}

// --- Survival (Task #21) ---

export interface SurvivalResult {
  status: "ok" | "insufficient_deaths" | "insufficient_games";
  nGames: number;
  nDeaths: number;
  medianLifespanWeeks: number | null;
  curve: { week: number; survival: number }[];
}
export function getSurvivalForGenre(genreId: string) {
  return getPayload<SurvivalResult>("survival_km", "genre", genreId);
}

// --- Trajectory clustering (Task #23) ---

export interface ClusteringGenre {
  nGames: number;
  archetypeCounts: Record<string, number>;
}
export function getClusteringForGenre(genreId: string) {
  return getPayload<ClusteringGenre>("trajectory_cluster", "genre", genreId);
}

// --- Momentum (Task #22) ---

export interface MomentumGenre {
  nGames: number;
  avgGrowth7d: number | null;
  topMovers: { gameId: string; name: string; growth7d: number | null }[];
}
export function getMomentumForGenre(genreId: string) {
  return getPayload<MomentumGenre>("trend_momentum", "genre", genreId);
}

// --- Change-point / anomalies (Task #25) ---

export interface Anomaly {
  at: string;
  value: number;
  prevValue: number;
  changePct: number;
  direction: "spike" | "drop";
  score: number;
}
export interface GameAnomalies {
  nAnomalies: number;
  anomalies: Anomaly[];
}
export interface RecentAnomaly extends Anomaly {
  scope: "game" | "genre";
  id: string;
  name: string;
}
export interface RecentAnomalies {
  recent: RecentAnomaly[];
  nTotal: number;
}
export function getAnomaliesForGame(gameId: string) {
  return getPayload<GameAnomalies>("change_point", "game", gameId);
}
export function getRecentAnomalies() {
  return getPayload<RecentAnomalies>("change_point", "global", null);
}

// --- Correlation & feature importance (Task #26) ---

export interface CorrelationResult {
  status: "ok" | "insufficient";
  n: number;
  target: string;
  targetLabel?: string;
  note?: string;
  correlations: { feature: string; label: string; spearman: number; pearson: number }[];
  importances: { feature: string; label: string; importance: number }[];
}
export function getCorrelation() {
  return getPayload<CorrelationResult>("correlation", "global", null);
}

// --- Cohort analysis (Task #27) ---

export interface CohortEntry {
  cohort: string;
  nGames: number;
  avgPlaying: number;
  medianPlaying: number;
  avgAgeWeeks: number;
  deadCount: number;
}
export interface Cohorts {
  cohorts: CohortEntry[];
  nGames: number;
}
export function getCohortsForGenre(genreId: string) {
  return getPayload<Cohorts>("cohort", "genre", genreId);
}
export function getCohortsGlobal() {
  return getPayload<Cohorts>("cohort", "global", null);
}

// --- Seasonality (Task #28) ---

export interface Seasonality {
  status: "ok" | "insufficient";
  distinctDays?: number;
  needDays?: number;
  byWeekday: { label: string; index: number }[];
  byHour: { key: number; index: number; avgPlaying: number }[];
  /** UTC weekday (0 = Mon) × UTC hour cells; `n` readings each. Absent on
   * payloads computed before Task #58. */
  byWeekdayHour?: { weekday: number; hour: number; index: number; n: number }[];
}
export function getSeasonalityForGenre(genreId: string) {
  return getPayload<Seasonality>("seasonality", "genre", genreId);
}

// --- Forecasting (Task #29) ---

export interface Forecast {
  status: "ok" | "insufficient";
  method: string;
  horizon?: number;
  lastValue?: number;
  trend?: "up" | "down" | "flat";
  points: { step: number; forecast: number; lower: number; upper: number }[];
  note?: string;
  /** ISO time of the last point the projection was fitted on (Task #57). */
  lastAt?: string;
  /** Length of one projection step, from the recent collection spacing. */
  stepHours?: number;
}
export function getForecastForGenre(genreId: string) {
  return getPayload<Forecast>("forecast", "genre", genreId);
}

/** When the analytics last ran, for a freshness note.
 *
 * Read from the last successful analytics JobRun: since Task #43 a result that
 * didn't change is left untouched (no write), so max(computedAt) now means
 * "last time something changed", not "last time it was computed". Falls back to
 * computedAt when no run has been recorded (e.g. a fresh local DB). */
export async function getAnalyticsComputedAt(): Promise<Date | null> {
  const lastRun = await getLastSuccessfulRun("analytics");
  if (lastRun) return lastRun.finishedAt;
  const row = await prisma.analyticsResult.findFirst({
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });
  return row?.computedAt ?? null;
}

// --- Update impact (Task #63) ---

export type UpdateImpactWindow =
  | { hours: number; status: "insufficient"; n: number; needUpdates: number }
  | {
      hours: number;
      status: "ok";
      n: number;
      medianChangePct: number;
      p25ChangePct: number;
      p75ChangePct: number;
      shareUp: number;
    };
export interface UpdateImpactGenre {
  minBaseline: number;
  windows: UpdateImpactWindow[];
}
export function getUpdateImpactForGenre(genreId: string) {
  return getPayload<UpdateImpactGenre>("update_impact", "genre", genreId);
}

// --- Launch benchmarks (Task #83) ---

export interface LaunchBenchmarkDay {
  day: number;
  /** Games with a reading that day. */
  n: number;
  /** Daily average players at each of `quantiles` (percent), ascending. */
  q: number[];
}
export interface LaunchBenchmark {
  status: "ok" | "insufficient";
  nGames: number;
  maxDay: number;
  nearLaunchDays: number;
  minGames: number;
  quantiles: number[];
  days: LaunchBenchmarkDay[];
}
export function getLaunchBenchmarkForGenre(genreId: string) {
  return getPayload<LaunchBenchmark>("launch_benchmark", "genre", genreId);
}

// --- Market concentration (Task #87) ---

export interface ConcentrationDay {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  /** Games with a reading that day. */
  n: number;
  /** Sum of the games' daily average players. */
  total: number;
  top1: number;
  top5: number;
  top10: number;
  /** Herfindahl-Hirschman index: the sum of squared shares, 0–1. */
  hhi: number;
}
export interface ConcentrationGenre {
  minGames: number;
  days: ConcentrationDay[];
}
export function getConcentrationForGenre(genreId: string) {
  return getPayload<ConcentrationGenre>("concentration", "genre", genreId);
}

/** Every genre's concentration series, keyed by genre id (~20 rows). */
export async function getConcentrationAll(): Promise<Map<string, ConcentrationGenre>> {
  const rows = await prisma.analyticsResult.findMany({
    where: { kind: "concentration", scopeType: "genre" },
    select: { scopeId: true, payload: true },
  });
  const out = new Map<string, ConcentrationGenre>();
  for (const r of rows) {
    if (!r.scopeId) continue;
    try {
      out.set(r.scopeId, JSON.parse(r.payload) as ConcentrationGenre);
    } catch {
      // A malformed payload leaves that genre out rather than failing the page.
    }
  }
  return out;
}

// --- Rank ladders (Task #90) ---

export interface RankLadder {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  /** Latest reading the day's ladder includes. */
  until: Date;
  minPlayers: number;
  /** Games with a reading that day, by genre id ("_" = unclassified). */
  n: Record<string, number>;
  /** Rounded daily averages >= minPlayers, descending, by genre id. */
  v: Record<string, number[]>;
}

/** The stored daily ladders from `fromDay` (YYYY-MM-DD) on, oldest first. */
export async function getRankLadders(fromDay?: string): Promise<RankLadder[]> {
  const rows = await prisma.analyticsResult.findMany({
    where: {
      kind: "rank_ladder",
      scopeType: "global",
      ...(fromDay ? { scopeId: { gte: fromDay } } : {}),
    },
    select: { scopeId: true, periodEnd: true, payload: true },
    orderBy: { scopeId: "asc" },
  });
  const out: RankLadder[] = [];
  for (const r of rows) {
    if (!r.scopeId || !r.periodEnd) continue;
    try {
      const p = JSON.parse(r.payload) as Omit<RankLadder, "day" | "until">;
      out.push({ day: r.scopeId, until: r.periodEnd, minPlayers: p.minPlayers, n: p.n, v: p.v });
    } catch {
      // Skip a malformed day.
    }
  }
  return out;
}
