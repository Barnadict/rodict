/**
 * Site-wide ⌘K search (Task #70). The server builds one compact index of
 * everything searchable (cached for hours), the browser downloads it once when
 * the palette first opens, and matching runs locally, so typing costs no
 * database reads (Turso bills rows read, and every keystroke would be a new
 * query). Pure so it's unit-testable.
 */

import { creatorPath } from "@/lib/creators";

export interface SearchIndex {
  /** [universeId, name, current players] */
  games: [string, string, number][];
  /** [slug, name] */
  genres: [string, string][];
  /** [slug, name] */
  themes: [string, string][];
  /** [creator page path, name, games tracked, current players] */
  creators: [string, string, number, number][];
}

export type SearchKind = "game" | "genre" | "theme" | "creator";

export interface SearchResult {
  kind: SearchKind;
  href: string;
  label: string;
  /** A short muted line, e.g. "1.2K playing". */
  detail?: string;
  /** Players, for ranking equal matches and for the detail line. */
  playing: number;
}

export interface CreatorSource {
  creatorId: bigint | null;
  creatorType: string | null;
  creatorName: string | null;
  currentPlaying: number;
}

/** Group games by creator into index rows (games count and total players). */
export function buildCreatorRows(games: CreatorSource[]): SearchIndex["creators"] {
  const byPath = new Map<string, { name: string; games: number; playing: number }>();
  for (const g of games) {
    const path = creatorPath(g.creatorId, g.creatorType);
    if (!path || !g.creatorName) continue;
    const entry = byPath.get(path) ?? { name: g.creatorName, games: 0, playing: 0 };
    entry.games++;
    entry.playing += g.currentPlaying;
    byPath.set(path, entry);
  }
  return [...byPath].map(([path, c]) => [path, c.name, c.games, c.playing]);
}

/** Lowercase, strip accents and anything that isn't a letter or digit. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * How well `name` matches the normalized query `q`, or 0 for no match:
 * 3 = the name starts with it, 2 = a word starts with it, 1 = it appears
 * anywhere. A multi-word query matches when every word does, scored by its
 * weakest word.
 */
export function matchScore(name: string, q: string): number {
  const n = normalize(name);
  if (!q || !n) return 0;
  if (n.startsWith(q)) return 3;
  const words = q.split(" ");
  let score = 3;
  for (const w of words) {
    if (n.startsWith(w)) continue;
    if (n.includes(` ${w}`)) score = Math.min(score, 2);
    else if (n.includes(w)) score = Math.min(score, 1);
    else return 0;
  }
  return Math.min(score, 2);
}

export const SEARCH_LIMITS: Record<SearchKind, number> = {
  game: 6,
  genre: 4,
  theme: 4,
  creator: 4,
};

function top(results: (SearchResult & { score: number })[], limit: number): SearchResult[] {
  return results
    .sort((a, b) => b.score - a.score || b.playing - a.playing || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((r) => ({
      kind: r.kind,
      href: r.href,
      label: r.label,
      detail: r.detail,
      playing: r.playing,
    }));
}

const playingLabel = (n: number) =>
  `${new Intl.NumberFormat("en-US", { notation: "compact" }).format(n)} playing`;

/** Search the index, best matches first within each kind. */
export function searchIndex(index: SearchIndex, query: string): SearchResult[] {
  const q = normalize(query);
  if (!q) return [];
  const scored = <T>(rows: T[], toResult: (row: T) => SearchResult) =>
    rows.flatMap((row) => {
      const r = toResult(row);
      const score = matchScore(r.label, q);
      return score > 0 ? [{ ...r, score }] : [];
    });

  return [
    ...top(
      scored(index.genres, ([slug, name]) => ({
        kind: "genre" as const,
        href: `/genres/${slug}`,
        label: name,
        detail: "Genre",
        playing: 0,
      })),
      SEARCH_LIMITS.genre,
    ),
    ...top(
      scored(index.themes, ([slug, name]) => ({
        kind: "theme" as const,
        href: `/themes/${slug}`,
        label: name,
        detail: "Theme",
        playing: 0,
      })),
      SEARCH_LIMITS.theme,
    ),
    ...top(
      scored(index.games, ([universeId, name, playing]) => ({
        kind: "game" as const,
        href: `/games/${universeId}`,
        label: name,
        detail: playingLabel(playing),
        playing,
      })),
      SEARCH_LIMITS.game,
    ),
    ...top(
      scored(index.creators, ([path, name, games, playing]) => ({
        kind: "creator" as const,
        href: path,
        label: name,
        detail: `${games} game${games === 1 ? "" : "s"} · ${playingLabel(playing)}`,
        playing,
      })),
      SEARCH_LIMITS.creator,
    ),
  ];
}
