/**
 * Weekly recap (Task #92): the last 7 days at a glance, on /weekly and as an
 * Atom feed at /weekly/feed. Built from queries the site already runs (rising
 * games and genres, new releases, the dead rule, flagged changes); this file
 * holds the pure parts, so they're tested without a database.
 */

import type { RecentAnomaly } from "@/lib/db/analytics";
import type { FeedEntry } from "@/lib/feed";
import { formatCompact } from "@/lib/format";
import { formatGrowthPct } from "@/lib/stats";

export const WEEKLY_DAYS = 7;
/** Rows per section. */
export const WEEKLY_LIMIT = 10;

const DAY_MS = 86_400_000;

/**
 * The biggest flagged spikes in the last WEEKLY_DAYS before `now`, largest
 * relative jump first. Genre spikes are kept; the page links only games.
 */
export function weeklySpikes(recent: RecentAnomaly[], now: Date): RecentAnomaly[] {
  const since = now.getTime() - WEEKLY_DAYS * DAY_MS;
  return recent
    .filter((a) => {
      const t = new Date(a.at).getTime();
      return a.direction === "spike" && !Number.isNaN(t) && t >= since && t <= now.getTime();
    })
    .sort((a, b) => b.changePct - a.changePct || a.at.localeCompare(b.at))
    .slice(0, WEEKLY_LIMIT);
}

/** ISO 8601 week of a date (UTC), e.g. "2026-W40". */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of this week decides the year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** A recap line: a name, an optional page, and what happened. */
export interface RecapItem {
  name: string;
  path?: string;
  detail: string;
}

export interface RecapSection {
  title: string;
  items: RecapItem[];
  /** How many qualified, when more than are listed. */
  total?: number;
}

/** What the recap is built from; the cached loader in cached-queries.ts fills it. */
export interface WeeklyData {
  risingGames: {
    universeId: string;
    name: string;
    genreName: string | null;
    basePlaying: number;
    currentPlaying: number;
    growthPct: number | null;
  }[];
  risingGenres: {
    slug: string;
    name: string;
    basePlaying: number;
    currentPlaying: number;
    growthPct: number | null;
  }[];
  entrants: {
    total: number;
    games: {
      universeId: string;
      name: string;
      currentPlaying: number;
      /** True when created on Roblox in the window, not only newly tracked. */
      newOnRoblox: boolean;
      genreName: string | null;
    }[];
  };
  deaths: {
    total: number;
    games: {
      universeId: string;
      name: string;
      deadSince: Date;
      allTimePeakPlayers: number;
      genreName: string | null;
    }[];
  };
  /** Flagged spikes, with the game's universe id when it's a game. */
  spikes: (RecentAnomaly & { universeId: string | null })[];
}

function avgMove(base: number, current: number, growth: number | null): string {
  return `${formatCompact(Math.round(base))} → ${formatCompact(Math.round(current))} avg players (${formatGrowthPct(growth)})`;
}

/** The recap as plain sections, in page order, for the feed. */
export function recapSections(d: WeeklyData): RecapSection[] {
  return [
    {
      title: "Top rising games",
      items: d.risingGames.map((g) => ({
        name: g.name,
        path: `/games/${g.universeId}`,
        detail: avgMove(g.basePlaying, g.currentPlaying, g.growthPct),
      })),
    },
    {
      title: "Top rising genres",
      items: d.risingGenres.map((g) => ({
        name: g.name,
        path: `/genres/${g.slug}`,
        detail: avgMove(g.basePlaying, g.currentPlaying, g.growthPct),
      })),
    },
    {
      title: "Biggest spikes",
      items: d.spikes.map((a) => ({
        name: a.scope === "genre" ? `${a.name} (genre)` : a.name,
        path: a.universeId ? `/games/${a.universeId}` : undefined,
        detail: `${formatCompact(a.prevValue)} → ${formatCompact(a.value)} players (${formatGrowthPct(a.changePct)})`,
      })),
    },
    {
      title: "New entrants",
      total: d.entrants.total,
      items: d.entrants.games.map((g) => ({
        name: g.name,
        path: `/games/${g.universeId}`,
        detail: `${formatCompact(g.currentPlaying)} playing now${g.newOnRoblox ? ", new on Roblox" : ", newly tracked"}`,
      })),
    },
    {
      title: "Went dead",
      total: d.deaths.total,
      items: d.deaths.games.map((g) => ({
        name: g.name,
        path: `/games/${g.universeId}`,
        detail: `peaked at ${formatCompact(g.allTimePeakPlayers)} players`,
      })),
    },
  ];
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * The feed's one entry per ISO week. Its id is the week, so a reader shows a
 * new recap once a week; rebuilds during the week update that entry in place
 * (the recap is always the 7 days up to `now`).
 */
export function weeklyFeedEntry(sections: RecapSection[], now: Date, origin: string): FeedEntry {
  const week = isoWeek(now);
  const nonEmpty = sections.filter((s) => s.items.length > 0);
  const summary = nonEmpty.length
    ? nonEmpty.map((s) => `${s.title}: ${s.items[0].name} (${s.items[0].detail})`).join(". ") + "."
    : "A quiet week: nothing qualified for the recap.";
  const content = nonEmpty
    .map((s) => {
      const more =
        s.total !== undefined && s.total > s.items.length
          ? `<p>…and ${s.total - s.items.length} more.</p>`
          : "";
      const items = s.items
        .map((i) => {
          const name = i.path
            ? `<a href="${escapeHtml(origin + i.path)}">${escapeHtml(i.name)}</a>`
            : escapeHtml(i.name);
          return `<li>${name}: ${escapeHtml(i.detail)}</li>`;
        })
        .join("");
      return `<h3>${escapeHtml(s.title)}</h3><ul>${items}</ul>${more}`;
    })
    .join("");
  return {
    id: `urn:rodict:weekly:${week}`,
    title: `rodict weekly recap, ${week}`,
    summary,
    path: "/weekly",
    updated: now,
    content: content || `<p>${escapeHtml(summary)}</p>`,
  };
}
