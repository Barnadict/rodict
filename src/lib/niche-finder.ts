/**
 * Niche finder (Task #111): genres and themes filtered by the constraints a
 * developer sets (size, crowding, growth, concentration, session length) and
 * ranked, each with the reasons it ranks where it does. Builds on the
 * opportunity score (Task #24) and market concentration (#87). Pure, so it's
 * tested without a database.
 *
 * Genres use the stored analytics: the opportunity score and its components,
 * the latest day's concentration and the pooled Est. session length. Themes
 * have no stored analytics, so their figures are worked out here from the
 * games tagged with them, with the same score formula and weights, scored
 * among themes only. Descriptive: it ranks by what the data shows and never
 * says what to build.
 */

import type { ConcentrationLevel } from "@/lib/concentration";
import { concentrationLevel } from "@/lib/concentration";
import { formatCompact, formatExact } from "@/lib/format";
import { formatGrowthPct } from "@/lib/stats";

export type NicheKind = "genre" | "theme";

/** The #24 weights (analytics/opportunity.py WEIGHTS); the stored payload's win when present. */
export const DEFAULT_WEIGHTS = {
  intensity: 0.4,
  demand: 0.25,
  growth: 0.2,
  supply: -0.15,
} as const;
export type ScoreWeights = Record<keyof typeof DEFAULT_WEIGHTS, number>;

/** Theme figures need at least this many games behind them, else they're left blank. */
export const THEME_MIN_GAMES = {
  /** Same floor as analytics/concentration.py MIN_GAMES. */
  concentration: 5,
  growth: 3,
  session: 3,
} as const;

export interface NicheRow {
  kind: NicheKind;
  id: string;
  slug: string;
  name: string;
  totalPlaying: number;
  gameCount: number;
  playersPerGame: number;
  /** Change in players over 7 days (0.1 = +10%), or null when unknown. */
  growth7d: number | null;
  /** Herfindahl-Hirschman index, 0–1, or null when too few games. */
  hhi: number | null;
  /** Est. minutes per visit, or null. */
  sessionMinutes: number | null;
  /** 0–100 within its kind, or null when it couldn't be scored. */
  score: number | null;
}

// --- Theme figures -----------------------------------------------------------

export interface ThemeGameInput {
  themeId: string;
  gameId: string;
  playing: number;
}

export interface GameGrowthInput {
  /** Average players at the start and end of the 7-day window. */
  basePlaying: number;
  currentPlaying: number;
}

/** HHI of a set of player counts, or null under `minGames` games with players. */
export function hhiOf(values: number[], minGames: number): number | null {
  const positive = values.filter((v) => v > 0);
  const total = positive.reduce((a, b) => a + b, 0);
  if (positive.length < minGames || total <= 0) return null;
  let hhi = 0;
  for (const v of positive) hhi += (v / total) ** 2;
  return hhi;
}

/**
 * Pooled Est. session length for a group of games: total players ÷ total
 * visits per hour, which is each game's minutes weighted by its players (the
 * way a genre pools its games). Null under `minGames` games with an estimate.
 */
export function pooledSession(
  games: { playing: number; minutes: number }[],
  minGames: number,
): number | null {
  let players = 0;
  let visitsPerMinute = 0;
  let n = 0;
  for (const g of games) {
    if (g.minutes <= 0 || g.playing <= 0) continue;
    players += g.playing;
    visitsPerMinute += g.playing / g.minutes;
    n++;
  }
  return n >= minGames && visitsPerMinute > 0 ? players / visitsPerMinute : null;
}

/** Combined 7-day change over the games that have a window figure. */
export function pooledGrowth(games: GameGrowthInput[], minGames: number): number | null {
  let base = 0;
  let cur = 0;
  for (const g of games) {
    base += g.basePlaying;
    cur += g.currentPlaying;
  }
  return games.length >= minGames && base > 0 ? cur / base - 1 : null;
}

/** Every theme's figures from its games (score filled in by scoreRows). */
export function themeRows(
  themes: { id: string; slug: string; name: string }[],
  pairs: ThemeGameInput[],
  sessionByGame: Map<string, number>,
  growthByGame: Map<string, GameGrowthInput>,
): NicheRow[] {
  const byTheme = new Map<string, ThemeGameInput[]>();
  for (const p of pairs) {
    const list = byTheme.get(p.themeId) ?? [];
    list.push(p);
    byTheme.set(p.themeId, list);
  }
  return themes.flatMap((t) => {
    const games = byTheme.get(t.id) ?? [];
    if (games.length === 0) return [];
    const totalPlaying = games.reduce((a, g) => a + g.playing, 0);
    return [
      {
        kind: "theme" as const,
        id: t.id,
        slug: t.slug,
        name: t.name,
        totalPlaying,
        gameCount: games.length,
        playersPerGame: totalPlaying / games.length,
        growth7d: pooledGrowth(
          games.flatMap((g) => growthByGame.get(g.gameId) ?? []),
          THEME_MIN_GAMES.growth,
        ),
        hhi: hhiOf(
          games.map((g) => g.playing),
          THEME_MIN_GAMES.concentration,
        ),
        sessionMinutes: pooledSession(
          games.flatMap((g) => {
            const minutes = sessionByGame.get(g.gameId);
            return minutes === undefined ? [] : [{ playing: g.playing, minutes }];
          }),
          THEME_MIN_GAMES.session,
        ),
        score: null,
      },
    ];
  });
}

// --- Score (a port of analytics/opportunity.py) -------------------------------

function minmax(values: number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi - lo < 1e-9) return values.map(() => 0.5);
  return values.map((v) => (v - lo) / (hi - lo));
}

/**
 * The opportunity score for a pool of rows, exactly as analytics/opportunity.py
 * computes it for genres: each component min-max normalized across the pool,
 * weighted, and the result normalized again to 0–100 (one decimal). Unknown
 * growth counts as 0, like the Python's fillna(0).
 */
export function scoreRows(rows: NicheRow[], weights: ScoreWeights = DEFAULT_WEIGHTS): NicheRow[] {
  if (rows.length === 0) return [];
  const intensity = minmax(rows.map((r) => r.playersPerGame));
  const demand = minmax(rows.map((r) => r.totalPlaying));
  const growth = minmax(rows.map((r) => r.growth7d ?? 0));
  const supply = minmax(rows.map((r) => r.gameCount));
  const raw = rows.map(
    (_, i) =>
      weights.intensity * intensity[i] +
      weights.demand * demand[i] +
      weights.growth * growth[i] +
      weights.supply * supply[i],
  );
  const scaled = minmax(raw);
  return rows.map((r, i) => ({ ...r, score: Math.round(scaled[i] * 1000) / 10 }));
}

// --- Constraints ---------------------------------------------------------------

export const SIZE_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "small", label: "Small" },
  { value: "mid", label: "Mid" },
  { value: "large", label: "Large" },
] as const;
export const CROWD_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "few", label: "Few games" },
  { value: "some", label: "Some" },
  { value: "many", label: "Many" },
] as const;
export const GROWTH_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "growing", label: "Growing" },
  { value: "fast", label: "+10%+" },
  { value: "shrinking", label: "Shrinking" },
] as const;
export const CONCENTRATION_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "spread", label: "Many small" },
  { value: "leaders", label: "A few leaders" },
  { value: "giants", label: "A few giants" },
] as const;
export const SESSION_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "short", label: "<15 min" },
  { value: "medium", label: "15–30 min" },
  { value: "long", label: "30+ min" },
] as const;
export const SORT_OPTIONS = [
  { value: "score", label: "Score" },
  { value: "ppg", label: "Players / game" },
  { value: "growth", label: "Growth" },
  { value: "open", label: "Least concentrated" },
] as const;

type OptionValue<T extends readonly { value: string }[]> = T[number]["value"];

export interface NicheFilters {
  size: OptionValue<typeof SIZE_OPTIONS>;
  crowd: OptionValue<typeof CROWD_OPTIONS>;
  growth: OptionValue<typeof GROWTH_OPTIONS>;
  concentration: OptionValue<typeof CONCENTRATION_OPTIONS>;
  session: OptionValue<typeof SESSION_OPTIONS>;
  sort: OptionValue<typeof SORT_OPTIONS>;
}

/** Query-string names for each filter. */
export const FILTER_PARAMS = {
  size: "size",
  crowd: "crowd",
  growth: "growth",
  concentration: "conc",
  session: "session",
  sort: "sort",
} as const satisfies Record<keyof NicheFilters, string>;

export const DEFAULT_FILTERS: NicheFilters = {
  size: "any",
  crowd: "any",
  growth: "any",
  concentration: "any",
  session: "any",
  sort: "score",
};

function pick<T extends readonly { value: string }[]>(
  options: T,
  raw: string | undefined,
  fallback: OptionValue<T>,
): OptionValue<T> {
  return (options.find((o) => o.value === raw)?.value as OptionValue<T>) ?? fallback;
}

export function parseFilters(get: (param: string) => string | undefined): NicheFilters {
  return {
    size: pick(SIZE_OPTIONS, get(FILTER_PARAMS.size), "any"),
    crowd: pick(CROWD_OPTIONS, get(FILTER_PARAMS.crowd), "any"),
    growth: pick(GROWTH_OPTIONS, get(FILTER_PARAMS.growth), "any"),
    concentration: pick(CONCENTRATION_OPTIONS, get(FILTER_PARAMS.concentration), "any"),
    session: pick(SESSION_OPTIONS, get(FILTER_PARAMS.session), "any"),
    sort: pick(SORT_OPTIONS, get(FILTER_PARAMS.sort), "score"),
  };
}

/** Growth at or above this counts as "+10%+". */
export const FAST_GROWTH = 0.1;
/** Session bands in minutes. */
export const SESSION_BANDS = { short: 15, long: 30 } as const;

/**
 * Share of the other rows in the pool with a strictly lower value, 0–1. A
 * pool of one sits in the middle.
 */
export function percentile(value: number, pool: number[]): number {
  if (pool.length <= 1) return 0.5;
  let below = 0;
  for (const v of pool) if (v < value) below++;
  return below / (pool.length - 1);
}

/** Bottom, middle or top third of the pool. */
export function third(value: number, pool: number[]): "low" | "mid" | "high" {
  const p = percentile(value, pool);
  return p < 1 / 3 ? "low" : p < 2 / 3 ? "mid" : "high";
}

const LEVEL_FOR: Record<Exclude<NicheFilters["concentration"], "any">, ConcentrationLevel> = {
  spread: "many small games",
  leaders: "a few leaders",
  giants: "a few giants",
};

/** Rows that meet every set constraint. Size and crowding are thirds of the same kind. */
export function applyFilters(rows: NicheRow[], f: NicheFilters): NicheRow[] {
  const sizes = rows.map((r) => r.totalPlaying);
  const counts = rows.map((r) => r.gameCount);
  return rows.filter((r) => {
    if (f.size !== "any") {
      const t = third(r.totalPlaying, sizes);
      if ({ small: "low", mid: "mid", large: "high" }[f.size] !== t) return false;
    }
    if (f.crowd !== "any") {
      const t = third(r.gameCount, counts);
      if ({ few: "low", some: "mid", many: "high" }[f.crowd] !== t) return false;
    }
    if (f.growth !== "any") {
      if (r.growth7d === null) return false;
      if (f.growth === "growing" && !(r.growth7d > 0)) return false;
      if (f.growth === "fast" && !(r.growth7d >= FAST_GROWTH)) return false;
      if (f.growth === "shrinking" && !(r.growth7d < 0)) return false;
    }
    if (f.concentration !== "any") {
      if (r.hhi === null || concentrationLevel(r.hhi) !== LEVEL_FOR[f.concentration]) return false;
    }
    if (f.session !== "any") {
      const m = r.sessionMinutes;
      if (m === null) return false;
      if (f.session === "short" && !(m < SESSION_BANDS.short)) return false;
      if (f.session === "medium" && !(m >= SESSION_BANDS.short && m < SESSION_BANDS.long))
        return false;
      if (f.session === "long" && !(m >= SESSION_BANDS.long)) return false;
    }
    return true;
  });
}

/** Sorted by the chosen order; rows missing the sort figure go last. */
export function sortRows(rows: NicheRow[], sort: NicheFilters["sort"]): NicheRow[] {
  const key = (r: NicheRow): number | null =>
    sort === "score"
      ? r.score
      : sort === "ppg"
        ? r.playersPerGame
        : sort === "growth"
          ? r.growth7d
          : r.hhi === null
            ? null
            : -r.hhi;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return b.totalPlaying - a.totalPlaying;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return kb - ka || b.totalPlaying - a.totalPlaying;
  });
}

// --- Reasons -------------------------------------------------------------------

const KIND_PLURAL: Record<NicheKind, string> = { genre: "genres", theme: "themes" };

/**
 * Why a row scores where it does: the score's components that sit above the
 * middle of its kind, strongest weighted contribution first, each with where
 * it ranks. A row with none gets one line saying so. Descriptive, never advice.
 */
export function reasons(
  row: NicheRow,
  pool: NicheRow[],
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): string[] {
  const of = KIND_PLURAL[row.kind];
  // "more than all other genres" / "more than 40% of other genres"
  const than = (p: number) =>
    p >= 1 ? `all other ${of}` : `${Math.round(p * 100)}% of other ${of}`;
  /** `position`: 0–1 share of the others this row beats on the component. */
  const parts: { position: number; weight: number; text: string }[] = [];

  const ppg = percentile(
    row.playersPerGame,
    pool.map((r) => r.playersPerGame),
  );
  parts.push({
    position: ppg,
    weight: weights.intensity,
    text: `${formatCompact(Math.round(row.playersPerGame))} players per game, more than ${than(ppg)}`,
  });

  const demand = percentile(
    row.totalPlaying,
    pool.map((r) => r.totalPlaying),
  );
  parts.push({
    position: demand,
    weight: weights.demand,
    text: `${formatCompact(row.totalPlaying)} players in all, more than ${than(demand)}`,
  });

  if (row.growth7d !== null) {
    const growth = percentile(
      row.growth7d,
      pool.flatMap((r) => (r.growth7d === null ? [] : [r.growth7d])),
    );
    parts.push({
      position: growth,
      weight: weights.growth,
      text: `${formatGrowthPct(row.growth7d)} players over 7 days, faster than ${than(growth)}`,
    });
  }

  // Crowding counts against the score, so fewer games is the helpful direction.
  const fewer = percentile(
    -row.gameCount,
    pool.map((r) => -r.gameCount),
  );
  parts.push({
    position: fewer,
    weight: weights.supply,
    text: `${formatExact(row.gameCount)} games, fewer than ${than(fewer)}`,
  });

  if (pool.length <= 1) return [`The only ${row.kind} with data so far`];
  const strong = parts
    .filter((p) => p.position > 0.5)
    .sort((a, b) => Math.abs(b.weight) * b.position - Math.abs(a.weight) * a.position);
  return strong.length > 0
    ? strong.slice(0, 3).map((p) => p.text)
    : [`Near or below the middle of ${of} on every part of the score`];
}
