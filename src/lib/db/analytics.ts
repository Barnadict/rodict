import { prisma } from "@/lib/prisma";

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
}
export function getForecastForGenre(genreId: string) {
  return getPayload<Forecast>("forecast", "genre", genreId);
}

/** When any analytics job last ran (max computedAt), for a freshness note. */
export async function getAnalyticsComputedAt(): Promise<Date | null> {
  const row = await prisma.analyticsResult.findFirst({
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });
  return row?.computedAt ?? null;
}
