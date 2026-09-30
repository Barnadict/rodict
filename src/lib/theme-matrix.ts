/**
 * Theme rollups and the genre × theme matrix (Task #64). Pure, so the grouping
 * is tested without a database: the page reads one row per (game, theme) pair
 * and everything here is in-memory arithmetic over those rows.
 *
 * Players per game is the MEDIAN of the games' current players: one hit in a
 * cell of five would otherwise set its average. The mean is kept alongside for
 * hover text.
 */

/** Cells with fewer games than this are greyed out: too few to read much into. */
export const MATRIX_MIN_N = 5;

export interface ThemeGameRow {
  gameId: string;
  themeId: string;
  genreId: string | null;
  playing: number;
  visits: bigint;
}

export interface GroupStats {
  n: number;
  totalPlaying: number;
  medianPlaying: number;
  meanPlaying: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function stats(playing: number[]): GroupStats {
  const total = playing.reduce((s, p) => s + p, 0);
  return {
    n: playing.length,
    totalPlaying: total,
    // Whole players: an even-sized group's median can land on a half.
    medianPlaying: Math.round(median(playing)),
    meanPlaying: playing.length ? total / playing.length : 0,
  };
}

export interface ThemeRollup extends GroupStats {
  themeId: string;
  totalVisits: bigint;
}

/** Per-theme totals over every game tagged with it, genre or not. */
export function rollupThemes(rows: ThemeGameRow[]): Map<string, ThemeRollup> {
  const byTheme = new Map<string, { playing: number[]; visits: bigint }>();
  for (const r of rows) {
    const g = byTheme.get(r.themeId) ?? { playing: [], visits: BigInt(0) };
    g.playing.push(r.playing);
    g.visits += r.visits;
    byTheme.set(r.themeId, g);
  }
  const out = new Map<string, ThemeRollup>();
  for (const [themeId, g] of byTheme) {
    out.set(themeId, { themeId, totalVisits: g.visits, ...stats(g.playing) });
  }
  return out;
}

export type MatrixCell = GroupStats;

/** `genreId:themeId` → cell. Games without a genre aren't placed in the matrix. */
export function buildGenreThemeMatrix(rows: ThemeGameRow[]): Map<string, MatrixCell> {
  const byCell = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.genreId) continue;
    const key = matrixKey(r.genreId, r.themeId);
    const list = byCell.get(key) ?? [];
    list.push(r.playing);
    byCell.set(key, list);
  }
  return new Map([...byCell].map(([key, playing]) => [key, stats(playing)]));
}

export function matrixKey(genreId: string, themeId: string): string {
  return `${genreId}:${themeId}`;
}

/**
 * Colour position (0–1) for a cell's players per game. Log scale, because
 * players per game spans several orders of magnitude, bounded by the smallest
 * and largest readable (n ≥ MATRIX_MIN_N) cells so a greyed-out outlier can't
 * set the range.
 */
export function logShadeDomain(values: number[]): [number, number] {
  const logs = values.filter((v) => v > 0).map((v) => Math.log10(v));
  if (logs.length === 0) return [0, 0];
  return [Math.min(...logs), Math.max(...logs)];
}

export function logShade(value: number, [lo, hi]: [number, number]): number {
  if (value <= 0) return 0;
  if (hi <= lo) return 0.5;
  return Math.min(1, Math.max(0, (Math.log10(value) - lo) / (hi - lo)));
}
