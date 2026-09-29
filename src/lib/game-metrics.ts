/**
 * Pure helpers for the game page (Tasks #60–#62): the chart's metric series,
 * "similar games" ranking, and the Roblox links + description cleanup. Kept
 * free of Prisma/React so they're unit-testable.
 */

import { SERIES_GAP_DAYS } from "@/lib/stats";

// ---------------------------------------------------------------------------
// Chart metrics (Task #61)
// ---------------------------------------------------------------------------

export const GAME_METRICS = [
  { value: "players", label: "Players" },
  { value: "visits", label: "Visits/day" },
  { value: "favorites", label: "Favorites" },
  { value: "likes", label: "Like ratio" },
] as const;

export type GameMetric = (typeof GAME_METRICS)[number]["value"];
export const DEFAULT_GAME_METRIC: GameMetric = "players";

export function parseGameMetric(raw: string | undefined): GameMetric {
  return GAME_METRICS.some((m) => m.value === raw) ? (raw as GameMetric) : DEFAULT_GAME_METRIC;
}

export interface MetricSnapshot {
  collectedAt: Date;
  playing: number;
  visits: bigint | number;
  favorites: number;
  upVotes: number;
  downVotes: number;
}

export interface MetricPoint {
  date: string;
  value: number;
}

const HOUR_MS = 3_600_000;

/**
 * One series per metric, oldest-first. Visits are cumulative, so "visits per
 * day" is DERIVED: the visit delta between consecutive snapshots ÷ the time
 * between them, plotted at the later snapshot. Pairs spanning a collection
 * gap (> SERIES_GAP_DAYS) are skipped — a 40-day average would pass for a
 * reading — as are negative deltas (Roblox occasionally revises counts down).
 * Like ratio = up ÷ (up + down); snapshots with no votes are skipped.
 */
export function buildMetricSeries(snapshots: MetricSnapshot[], metric: GameMetric): MetricPoint[] {
  const out: MetricPoint[] = [];
  const at = (s: MetricSnapshot) => s.collectedAt.toISOString();
  switch (metric) {
    case "players":
      for (const s of snapshots) out.push({ date: at(s), value: s.playing });
      break;
    case "favorites":
      for (const s of snapshots) out.push({ date: at(s), value: s.favorites });
      break;
    case "likes":
      for (const s of snapshots) {
        const total = s.upVotes + s.downVotes;
        if (total > 0) out.push({ date: at(s), value: s.upVotes / total });
      }
      break;
    case "visits":
      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1];
        const cur = snapshots[i];
        const hours = (cur.collectedAt.getTime() - prev.collectedAt.getTime()) / HOUR_MS;
        if (hours <= 0 || hours > SERIES_GAP_DAYS * 24) continue;
        const delta = Number(BigInt(cur.visits) - BigInt(prev.visits));
        if (delta < 0) continue;
        out.push({ date: at(cur), value: Math.round((delta / hours) * 24) });
      }
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Similar games (Task #62)
// ---------------------------------------------------------------------------

/** Candidates must be within this factor of the game's CCU (either side). */
export const SIMILAR_CCU_FACTOR = 4;
/** Floor on the band's upper edge so tiny games still have neighbours. */
export const SIMILAR_CCU_MIN_UPPER = 20;

export function similarCcuBand(playing: number): { min: number; max: number } {
  return {
    min: Math.floor(playing / SIMILAR_CCU_FACTOR),
    max: Math.max(SIMILAR_CCU_MIN_UPPER, Math.ceil(playing * SIMILAR_CCU_FACTOR)),
  };
}

export interface SimilarCandidate {
  id: string;
  currentPlaying: number;
  themeIds: string[];
}

/**
 * Ranks same-genre candidates already inside the CCU band: shared themes first
 * (each one outweighs any CCU difference inside the band), then closeness in
 * log-CCU, so a game at 2× reads as near as one at ½×.
 */
export function rankSimilarGames<T extends SimilarCandidate>(
  target: { currentPlaying: number; themeIds: string[] },
  candidates: T[],
  limit: number,
): (T & { sharedThemes: number })[] {
  const themes = new Set(target.themeIds);
  const logT = Math.log1p(target.currentPlaying);
  return candidates
    .map((c) => ({
      c,
      shared: c.themeIds.filter((id) => themes.has(id)).length,
      dist: Math.abs(Math.log1p(c.currentPlaying) - logT),
    }))
    .sort(
      (a, b) => b.shared - a.shared || a.dist - b.dist || b.c.currentPlaying - a.c.currentPlaying,
    )
    .slice(0, limit)
    .map(({ c, shared }) => ({ ...c, sharedThemes: shared }));
}

// ---------------------------------------------------------------------------
// Roblox links + description (Task #60)
// ---------------------------------------------------------------------------

export function robloxGameUrl(rootPlaceId: bigint | null): string | null {
  return rootPlaceId ? `https://www.roblox.com/games/${rootPlaceId}` : null;
}

export function robloxCreatorUrl(
  creatorId: bigint | null,
  creatorType: string | null,
): string | null {
  if (!creatorId) return null;
  if (creatorType === "Group") return `https://www.roblox.com/communities/${creatorId}`;
  if (creatorType === "User") return `https://www.roblox.com/users/${creatorId}/profile`;
  return null;
}

/** Longest description we render; Roblox allows ~1K, but some are padded SEO spam. */
export const DESCRIPTION_MAX_CHARS = 4000;

/**
 * Plain-text cleanup for a Roblox description. React escapes it anyway, so this
 * is about readability, not injection: drop control/zero-width/bidi-override
 * characters, normalize line endings, trim each line, collapse runs of blank
 * lines, and cap the length. Returns null when nothing is left.
 */
export function cleanDescription(raw: string | null): string | null {
  if (!raw) return null;
  let text = raw
    .replace(/\r\n?/g, "\n")
    // C0/C1 controls except \n and \t, zero-width chars, bidi overrides/isolates.
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  if (text.length > DESCRIPTION_MAX_CHARS)
    text = `${text.slice(0, DESCRIPTION_MAX_CHARS).trimEnd()}…`;
  return text;
}
