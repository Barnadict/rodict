/**
 * Sanitization layer between the Roblox client (Task #6) and any DB write
 * (collector, Task #8): validates each raw row against a schema, drops
 * anything that fails (with the reason, for the collector to log/monitor —
 * see Task #34), and dedupes by primary key. Bad rows never reach analytics.
 */
import type { z } from "zod";

import type { GameIcon } from "@/lib/roblox/client";
import type { RobloxGameDetail, RobloxGameVotes, RobloxSearchGame } from "@/lib/roblox/types";
import type { CreatorType } from "@/lib/db-constants";

import { gameDetailSchema, gameIconSchema, gameVotesSchema, searchGameSchema } from "./schemas";

export interface Rejected<T> {
  input: T;
  reasons: string[];
}

export interface SanitizeResult<T> {
  valid: T[];
  rejected: Rejected<T>[];
  /** Duplicate rows dropped after validation (kept the first occurrence). */
  duplicates: T[];
}

function issuesToReasons(issues: z.core.$ZodIssue[]): string[] {
  return issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}

function dedupeBy<T, K>(items: T[], keyFn: (item: T) => K): { deduped: T[]; duplicates: T[] } {
  const seen = new Set<K>();
  const deduped: T[] = [];
  const duplicates: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      duplicates.push(item);
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return { deduped, duplicates };
}

/**
 * Validate a raw list against a schema, then dedupe the survivors by `keyFn`.
 * Keeps the caller's original (fully-typed) object for valid rows rather than
 * the zod-parsed clone, so callers keep fields the schema doesn't check.
 */
function sanitize<T, K>(
  items: T[],
  schema: z.ZodTypeAny,
  keyFn: (item: T) => K,
): SanitizeResult<T> {
  const passed: T[] = [];
  const rejected: Rejected<T>[] = [];
  for (const item of items) {
    const result = schema.safeParse(item);
    if (result.success) {
      passed.push(item);
    } else {
      rejected.push({ input: item, reasons: issuesToReasons(result.error.issues) });
    }
  }
  const { deduped, duplicates } = dedupeBy(passed, keyFn);
  return { valid: deduped, rejected, duplicates };
}

export function sanitizeGameDetails(items: RobloxGameDetail[]): SanitizeResult<RobloxGameDetail> {
  return sanitize(items, gameDetailSchema, (g) => g.id);
}

export function sanitizeGameVotes(items: RobloxGameVotes[]): SanitizeResult<RobloxGameVotes> {
  return sanitize(items, gameVotesSchema, (v) => v.id);
}

export function sanitizeGameIcons(items: GameIcon[]): SanitizeResult<GameIcon> {
  return sanitize(items, gameIconSchema, (i) => i.universeId);
}

export function sanitizeSearchGames(items: RobloxSearchGame[]): SanitizeResult<RobloxSearchGame> {
  return sanitize(items, searchGameSchema, (g) => g.universeId);
}

// ---------------------------------------------------------------------------
// Cross-endpoint merge: combine validated details + votes (+ optional icon)
// into one clean record shaped for the DB (Task #4's Game/GameSnapshot
// fields). This is what Task #8's collector will call after sanitizing each
// endpoint's raw response.
// ---------------------------------------------------------------------------

export interface CleanGame {
  universeId: bigint;
  rootPlaceId: bigint;
  name: string;
  description: string | null;
  creatorId: bigint;
  creatorName: string;
  creatorType: CreatorType;
  robloxCreatedAt: Date;
  robloxUpdatedAt: Date;
  /** Roblox genre signals, most-specific first, nulls dropped — feed straight
   * into the taxonomy resolver (src/lib/taxonomy). */
  genreSignals: string[];
  playing: number;
  visits: bigint;
  favorites: number;
  upVotes: number;
  downVotes: number;
  maxPlayers: number;
}

export interface MergeWarning {
  universeId: number;
  message: string;
}

/**
 * Merge already-sanitized details + votes into clean, DB-ready records.
 * Votes are supplementary: a game missing votes is still included (defaulted
 * to 0/0) with a warning, rather than dropped — losing an otherwise-valid
 * snapshot over a secondary endpoint hiccup would create gaps in the very
 * history the collector exists to build.
 */
export function mergeGameData(
  details: RobloxGameDetail[],
  votes: RobloxGameVotes[],
): { games: CleanGame[]; warnings: MergeWarning[] } {
  const votesById = new Map(votes.map((v) => [v.id, v]));
  const games: CleanGame[] = [];
  const warnings: MergeWarning[] = [];

  for (const d of details) {
    const v = votesById.get(d.id);
    if (!v) {
      warnings.push({ universeId: d.id, message: "missing votes data; defaulted to 0/0" });
    }
    games.push({
      universeId: BigInt(d.id),
      rootPlaceId: BigInt(d.rootPlaceId),
      name: d.name,
      description: d.description,
      creatorId: BigInt(d.creator.id),
      creatorName: d.creator.name,
      creatorType: d.creator.type,
      robloxCreatedAt: new Date(d.created),
      robloxUpdatedAt: new Date(d.updated),
      genreSignals: [d.genre_l2, d.genre_l1, d.genre].filter((g): g is string => !!g),
      playing: d.playing,
      visits: BigInt(d.visits),
      favorites: d.favoritedCount,
      upVotes: v?.upVotes ?? 0,
      downVotes: v?.downVotes ?? 0,
      maxPlayers: d.maxPlayers,
    });
  }

  return { games, warnings };
}
