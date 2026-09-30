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
