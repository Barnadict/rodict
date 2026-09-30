/**
 * Creator/studio pages (Task #67): a Roblox user or group and the games of
 * theirs we track. User and group ids are separate Roblox namespaces, so the
 * URL carries the type: `/creators/user-123`, `/creators/group-456`. Pure, so
 * it's tested without a database.
 */

import type { CreatorType } from "@/lib/db-constants";

/**
 * A game counts as a "hit" when its all-time peak, as we observed it, reached
 * this many concurrent players. Our own threshold, not a Roblox label, and the
 * peak only covers the time since we started tracking the game.
 */
export const HIT_PEAK_PLAYERS = 1_000;

export interface CreatorRef {
  type: CreatorType;
  id: bigint;
}

const PARAM_PATTERN = /^(user|group)-(\d{1,20})$/;

/** `user-123` / `group-456` → the creator, or null for anything else. */
export function parseCreatorParam(raw: string): CreatorRef | null {
  const m = PARAM_PATTERN.exec(raw);
  if (!m) return null;
  const id = BigInt(m[2]);
  if (id <= BigInt(0)) return null;
  return { type: m[1] === "group" ? "Group" : "User", id };
}

/** The creator page for a game's creator, or null when it isn't known. */
export function creatorPath(creatorId: bigint | null, creatorType: string | null): string | null {
  if (!creatorId) return null;
  if (creatorType === "Group") return `/creators/group-${creatorId}`;
  if (creatorType === "User") return `/creators/user-${creatorId}`;
  return null;
}

export interface CreatorGame {
  name: string;
  creatorName: string | null;
  lastCollectedAt: Date | null;
  currentPlaying: number;
  allTimePeakPlayers: number;
  status: string;
  genre: { id: string; slug: string; name: string } | null;
}

export interface CreatorGenre {
  slug: string;
  name: string;
  games: number;
  playing: number;
}

export interface CreatorSummary {
  /** The name on their most recently collected game (names can change). */
  name: string | null;
  games: number;
  active: number;
  totalPlaying: number;
  hits: number;
  /** Genres covered, most games first; unclassified games are left out. */
  genres: CreatorGenre[];
  unclassified: number;
}

export function isHit(game: Pick<CreatorGame, "allTimePeakPlayers">): boolean {
  return game.allTimePeakPlayers >= HIT_PEAK_PLAYERS;
}

export function summarizeCreator(games: CreatorGame[]): CreatorSummary {
  let latest: CreatorGame | null = null;
  const genres = new Map<string, CreatorGenre>();
  let unclassified = 0;
  for (const g of games) {
    const t = g.lastCollectedAt?.getTime() ?? -Infinity;
    if (g.creatorName && (!latest || t > (latest.lastCollectedAt?.getTime() ?? -Infinity)))
      latest = g;
    if (!g.genre) {
      unclassified++;
      continue;
    }
    const entry = genres.get(g.genre.id) ?? {
      slug: g.genre.slug,
      name: g.genre.name,
      games: 0,
      playing: 0,
    };
    entry.games++;
    entry.playing += g.currentPlaying;
    genres.set(g.genre.id, entry);
  }
  return {
    name: latest?.creatorName ?? null,
    games: games.length,
    active: games.filter((g) => g.status !== "dead").length,
    totalPlaying: games.reduce((s, g) => s + g.currentPlaying, 0),
    hits: games.filter(isHit).length,
    genres: [...genres.values()].sort((a, b) => b.games - a.games || b.playing - a.playing),
    unclassified,
  };
}

// ---------------------------------------------------------------------------
// Creator leaderboard (Task #86)
// ---------------------------------------------------------------------------

/** Creators listed on the leaderboard at once. */
export const CREATORS_LIMIT = 100;
/** Games a creator needs before their hit rate is ranked (1 of 1 is 100%). */
export const HIT_RATE_MIN_GAMES = 3;

export const CREATOR_SORTS = [
  { value: "playing", label: "Players now" },
  { value: "games", label: "Games tracked" },
  { value: "active", label: "Active games" },
  { value: "hits", label: "Hits" },
  { value: "hitRate", label: "Hit rate" },
] as const;
export type CreatorSort = (typeof CREATOR_SORTS)[number]["value"];

export function parseCreatorSort(raw: string | undefined): CreatorSort {
  return CREATOR_SORTS.find((s) => s.value === raw)?.value ?? "playing";
}

export interface CreatorRow {
  type: CreatorType;
  id: bigint;
  name: string | null;
  games: number;
  active: number;
  totalPlaying: number;
  hits: number;
}

/** Share of a creator's tracked games that are hits. */
export function hitRate(row: Pick<CreatorRow, "games" | "hits">): number {
  return row.games > 0 ? row.hits / row.games : 0;
}

/**
 * Creators ordered by the chosen column, busiest first on ties. The hit-rate
 * ranking leaves out creators with fewer than HIT_RATE_MIN_GAMES games.
 */
export function rankCreators<T extends CreatorRow>(rows: T[], sort: CreatorSort): T[] {
  const value = (r: T): number => {
    switch (sort) {
      case "playing":
        return r.totalPlaying;
      case "games":
        return r.games;
      case "active":
        return r.active;
      case "hits":
        return r.hits;
      case "hitRate":
        return hitRate(r);
    }
  };
  return rows
    .filter((r) => sort !== "hitRate" || r.games >= HIT_RATE_MIN_GAMES)
    .sort((a, b) => value(b) - value(a) || b.totalPlaying - a.totalPlaying || b.games - a.games);
}
