/**
 * Compare view (Task #65): the selection lives in the URL
 * (`/compare?games=1,2&genres=rpg`) so a comparison can be shared, and the
 * series are merged here for one chart. Pure, so it's tested without a page.
 */

/** Series per chart. The categorical palette has four validated slots. */
export const COMPARE_MAX = 4;

export type CompareKind = "game" | "genre";

export interface CompareSelection {
  /** Universe ids, as strings (BigInt-safe). */
  games: string[];
  /** Genre slugs. */
  genres: string[];
}

/** Categorical slot for the i-th series (fixed order, never cycled: max 4). */
export function seriesColor(i: number): string {
  return `var(--series-${i + 1})`;
}

export const EMPTY_SELECTION: CompareSelection = { games: [], genres: [] };

const ID_PATTERN: Record<CompareKind, RegExp> = {
  game: /^\d{1,20}$/,
  genre: /^[a-z0-9-]{1,40}$/,
};

/** A comma-separated param → valid, de-duplicated ids, first COMPARE_MAX kept. */
export function parseIdList(raw: string | undefined, kind: CompareKind): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (ID_PATTERN[kind].test(id) && !out.includes(id)) out.push(id);
    if (out.length === COMPARE_MAX) break;
  }
  return out;
}

export function parseCompareSelection(params: {
  games?: string;
  genres?: string;
}): CompareSelection {
  return {
    games: parseIdList(params.games, "game"),
    genres: parseIdList(params.genres, "genre"),
  };
}

function listFor(sel: CompareSelection, kind: CompareKind): string[] {
  return kind === "game" ? sel.games : sel.genres;
}

function withList(sel: CompareSelection, kind: CompareKind, list: string[]): CompareSelection {
  return kind === "game" ? { ...sel, games: list } : { ...sel, genres: list };
}

export function isSelected(sel: CompareSelection, kind: CompareKind, id: string): boolean {
  return listFor(sel, kind).includes(id);
}

/** Adds an id; when the list is full the oldest one makes room. */
export function withAdded(sel: CompareSelection, kind: CompareKind, id: string): CompareSelection {
  const list = listFor(sel, kind);
  if (list.includes(id)) return sel;
  return withList(sel, kind, [...list, id].slice(-COMPARE_MAX));
}

export function withRemoved(
  sel: CompareSelection,
  kind: CompareKind,
  id: string,
): CompareSelection {
  return withList(
    sel,
    kind,
    listFor(sel, kind).filter((x) => x !== id),
  );
}

/** `/compare?...` for a selection, plus any other params to keep (range, scale). */
export function compareHref(
  sel: CompareSelection,
  extra: Record<string, string | undefined> = {},
): string {
  const parts: string[] = [];
  // Commas stay readable in a shared link; ids and slugs never contain one.
  if (sel.games.length) parts.push(`games=${sel.games.join(",")}`);
  if (sel.genres.length) parts.push(`genres=${sel.genres.join(",")}`);
  for (const [k, v] of Object.entries(extra)) if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
  return parts.length ? `/compare?${parts.join("&")}` : "/compare";
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  /** Epoch ms. */
  t: number;
  value: number;
}

export type CompareScale = "absolute" | "indexed";

export function parseCompareScale(raw: string | undefined): CompareScale {
  return raw === "indexed" ? "indexed" : "absolute";
}

/**
 * Rebase a series to 100 at its first positive reading, so a 50-player game and
 * a 50K-player game can share one axis as relative change. Readings before
 * that first positive one are dropped (there's nothing to divide by).
 */
export function indexSeries(points: SeriesPoint[]): SeriesPoint[] {
  const start = points.findIndex((p) => p.value > 0);
  if (start < 0) return [];
  const base = points[start].value;
  return points.slice(start).map((p) => ({ t: p.t, value: (p.value / base) * 100 }));
}

export type MergedRow = { t: number } & Record<string, number | null>;

/**
 * Merge series with different timestamps onto one timeline for a shared chart.
 *
 * Games are collected at different cadences (every run when busy, about daily
 * when quiet), so at most rows a given series has no reading. Between two of
 * its own readings no more than `gapMs` apart it's interpolated, which keeps
 * the line continuous; across a longer gap (a collection outage) and outside
 * its own first–last span it's null, which breaks the line there. Drawn values
 * only: tooltips read the real readings via `latestAtOrBefore`.
 */
export function mergeSeries(
  series: { key: string; points: SeriesPoint[] }[],
  gapMs: number,
): MergedRow[] {
  // A line joins consecutive non-null rows however far apart they are, so each
  // of a series' own gaps also gets a row in the middle, where the rule below
  // makes it null. Without it, a gap with no other series' readings inside
  // would be drawn straight across.
  const gapBreaks = series.flatMap(({ points }) =>
    points.slice(1).flatMap((b, i) => (b.t - points[i].t > gapMs ? [(points[i].t + b.t) / 2] : [])),
  );
  const times = [
    ...new Set([...series.flatMap((s) => s.points.map((p) => p.t)), ...gapBreaks]),
  ].sort((a, b) => a - b);
  const rows: MergedRow[] = times.map((t) => ({ t }) as MergedRow);
  for (const { key, points } of series) {
    let i = 0; // index of the last own point at or before the row's time
    for (const row of rows) {
      while (i + 1 < points.length && points[i + 1].t <= row.t) i++;
      const a = points[i];
      if (!a || row.t < a.t) {
        row[key] = null;
      } else if (a.t === row.t) {
        row[key] = a.value;
      } else {
        const b = points[i + 1];
        row[key] =
          b && b.t - a.t <= gapMs
            ? a.value + ((b.value - a.value) * (row.t - a.t)) / (b.t - a.t)
            : null;
      }
    }
  }
  return rows;
}

/** The latest reading at or before `t`, if it's no older than `maxAgeMs`. */
export function latestAtOrBefore(
  points: SeriesPoint[],
  t: number,
  maxAgeMs: number,
): SeriesPoint | null {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  return t - points[found].t <= maxAgeMs ? points[found] : null;
}

export interface WindowChange {
  base: number;
  current: number;
  /** (current − base) / base, or null when the base is 0. */
  pct: number | null;
}

/**
 * Change over a series' span, comparing the average over its first `windowMs`
 * with the average over its last `windowMs` (the same daily-average idea as
 * /trending, Task #53, so time of day doesn't decide it). Null unless the span
 * covers two full windows.
 */
export function windowAverageChange(points: SeriesPoint[], windowMs: number): WindowChange | null {
  if (points.length < 2) return null;
  const first = points[0].t;
  const last = points[points.length - 1].t;
  if (last - first < 2 * windowMs) return null;
  const avg = (ps: SeriesPoint[]) => ps.reduce((s, p) => s + p.value, 0) / ps.length;
  const base = avg(points.filter((p) => p.t < first + windowMs));
  const current = avg(points.filter((p) => p.t > last - windowMs));
  return { base, current, pct: base > 0 ? (current - base) / base : null };
}
