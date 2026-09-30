/**
 * Watchlist feed (Task #68): an Atom feed at `/feed?games=…&genres=…` listing
 * recent flagged changes and big weekly moves for the given games and genres,
 * so a feed reader can alert on a watchlist without accounts or stored state.
 * Pure, so it's tested without a database.
 */

import type { Anomaly } from "@/lib/db/analytics";
import { weekOverWeek, type Reading, type RecentChange } from "@/lib/new-releases";

/** Ids read per kind. A watchlist past this is truncated, not rejected. */
export const FEED_MAX_IDS = 50;
/** Flagged changes older than this drop out of the feed. */
export const FEED_WINDOW_DAYS = 14;
export const FEED_MAX_ENTRIES = 50;
/**
 * A "big move" is a week-over-week change in 24h average players of at least
 * this share AND this many players, the same two bars anomaly detection uses
 * for a single step (MIN_ABS_CHANGE / MIN_ABS_PLAYERS in analytics/anomaly.py).
 */
export const BIG_MOVE_MIN_PCT = 0.25;
export const BIG_MOVE_MIN_PLAYERS = 50;

const DAY_MS = 86_400_000;

export type FeedKind = "game" | "genre";

export interface FeedSelection {
  /** Universe ids, as strings (BigInt-safe). */
  games: string[];
  /** Genre slugs. */
  genres: string[];
}

const ID_PATTERN: Record<FeedKind, RegExp> = {
  game: /^\d{1,20}$/,
  genre: /^[a-z0-9-]{1,40}$/,
};

/** Valid, de-duplicated, sorted ids (sorted so equal watchlists share a cache entry). */
export function parseFeedIds(raw: string | null | undefined, kind: FeedKind): string[] {
  if (!raw) return [];
  const ids = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (ID_PATTERN[kind].test(id)) ids.add(id);
    if (ids.size === FEED_MAX_IDS) break;
  }
  return [...ids].sort();
}

/** The query string for a watchlist's feed, or null when it's empty. */
export function feedQuery(sel: FeedSelection): string | null {
  const params = new URLSearchParams();
  if (sel.games.length) params.set("games", sel.games.join(","));
  if (sel.genres.length) params.set("genres", sel.genres.join(","));
  const q = params.toString().replaceAll("%2C", ",");
  return q ? `?${q}` : null;
}

/** One game or genre as the feed sees it. */
export interface FeedSubject {
  kind: FeedKind;
  /** Universe id or genre slug: what the page URL uses. */
  id: string;
  name: string;
  anomalies: Anomaly[];
  readings: Reading[];
}

export interface FeedEntry {
  /** Stable across rebuilds, so a reader shows each event once. */
  id: string;
  title: string;
  summary: string;
  /** Site-relative page path. */
  path: string;
  updated: Date;
  /** Optional HTML body, shown by readers in place of the summary. */
  content?: string;
}

/** A week-over-week change big enough to report, or null. */
export function bigMove(readings: Reading[]): RecentChange | null {
  const change = weekOverWeek(readings);
  if (!change || change.pct === null) return null;
  if (Math.abs(change.pct) < BIG_MOVE_MIN_PCT) return null;
  if (Math.abs(change.current - change.base) < BIG_MOVE_MIN_PLAYERS) return null;
  return change;
}

function pct(p: number): string {
  const v = Math.round(p * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}

function players(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function pathFor(s: Pick<FeedSubject, "kind" | "id">): string {
  return s.kind === "game" ? `/games/${s.id}` : `/genres/${s.id}`;
}

/**
 * Feed entries for the given subjects, newest first: flagged changes within
 * FEED_WINDOW_DAYS of `now`, and at most one big move per subject, keyed by the
 * day of its latest reading so it shows once a day while the move lasts.
 */
export function buildFeedEntries(subjects: FeedSubject[], now: Date): FeedEntry[] {
  const since = now.getTime() - FEED_WINDOW_DAYS * DAY_MS;
  const entries: FeedEntry[] = [];
  for (const s of subjects) {
    const label = s.kind === "game" ? s.name : `${s.name} (genre)`;
    const what = s.kind === "game" ? "players" : "total players";
    for (const a of s.anomalies) {
      const at = new Date(a.at);
      if (Number.isNaN(at.getTime()) || at.getTime() < since) continue;
      const word = a.direction === "spike" ? "Spike" : "Drop";
      entries.push({
        id: `urn:rodict:change:${s.kind}:${s.id}:${a.at}`,
        title: `${word}: ${label} ${what} ${pct(a.changePct)}`,
        summary:
          `${label}: ${what} went from ${players(a.prevValue)} to ${players(a.value)} ` +
          `between two collections. Flagged automatically as unusual for this series; ` +
          `it says what happened, not why.`,
        path: pathFor(s),
        updated: at,
      });
    }
    const move = bigMove(s.readings);
    if (move) {
      const last = new Date(Math.max(...s.readings.map((r) => r.t)));
      entries.push({
        id: `urn:rodict:move:${s.kind}:${s.id}:${last.toISOString().slice(0, 10)}`,
        title: `${move.pct! > 0 ? "Up" : "Down"} ${pct(move.pct!)} this week: ${label}`,
        summary:
          `${label}: average ${what} over the last 24h was ${players(move.current)}, ` +
          `vs. ${players(move.base)} in the same 24h a week earlier (${pct(move.pct!)}).`,
        path: pathFor(s),
        updated: last,
      });
    }
  }
  return entries
    .sort((a, b) => b.updated.getTime() - a.updated.getTime() || a.id.localeCompare(b.id))
    .slice(0, FEED_MAX_ENTRIES);
}

function xml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** An Atom 1.0 document. `origin` makes the links absolute. */
export function renderAtom(opts: {
  origin: string;
  selfPath: string;
  entries: FeedEntry[];
  updated: Date;
  title: string;
  subtitle: string;
  /** The page the feed mirrors. */
  alternatePath: string;
}): string {
  const { origin, selfPath, entries, updated, title, subtitle, alternatePath } = opts;
  const body = entries
    .map(
      (e) => `  <entry>
    <id>${xml(e.id)}</id>
    <title>${xml(e.title)}</title>
    <link href="${xml(origin + e.path)}"/>
    <updated>${e.updated.toISOString()}</updated>
    <summary>${xml(e.summary)}</summary>${
      e.content
        ? `
    <content type="html">${xml(e.content)}</content>`
        : ""
    }
  </entry>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${xml(origin + selfPath)}</id>
  <title>${xml(title)}</title>
  <subtitle>${xml(subtitle)}</subtitle>
  <link rel="self" href="${xml(origin + selfPath)}"/>
  <link href="${xml(origin + alternatePath)}"/>
  <author><name>rodict</name></author>
  <updated>${updated.toISOString()}</updated>
${body}
</feed>
`;
}
