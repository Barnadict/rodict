/**
 * Game-pass catalogs (Task #69): pure helpers for the weekly refresh job and
 * the game page. Kept free of Prisma so they're unit-testable.
 *
 * Budget-aware design: a catalog is written only when its on-sale list
 * changes, and there's no "last checked" column to rewrite on every check.
 * Instead each game belongs to one of 7 daily shards (universe id mod 7), so
 * every game is re-checked once a week with nothing recorded about the check.
 */

import type { RobloxGamePass } from "@/lib/roblox/types";

export interface CatalogPass {
  id: number;
  name: string;
  /** Price in Robux. */
  price: number;
}

export interface PassCatalog {
  /** On-sale passes, sorted by id so equal catalogs serialize identically. */
  passes: CatalogPass[];
  forSaleCount: number;
  /** Robux to buy every on-sale pass once. */
  totalRobux: number;
}

/** Longest pass name kept (names are shown on the game page only). */
const MAX_NAME_LENGTH = 80;

/**
 * Normalize the API's pass list to what we store: on-sale passes with a
 * positive whole-Robux price. Off-sale passes and malformed rows are dropped,
 * and duplicate ids are kept once.
 */
export function toPassCatalog(raw: RobloxGamePass[]): PassCatalog {
  const byId = new Map<number, CatalogPass>();
  for (const p of raw) {
    if (!p || p.isForSale !== true) continue;
    if (typeof p.id !== "number" || !Number.isFinite(p.id)) continue;
    const price = p.price;
    if (typeof price !== "number" || !Number.isInteger(price) || price <= 0) continue;
    const name = String(p.displayName || p.name || "")
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, "")
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    byId.set(p.id, { id: p.id, name: name || `Pass ${p.id}`, price });
  }
  const passes = [...byId.values()].sort((a, b) => a.id - b.id);
  return {
    passes,
    forSaleCount: passes.length,
    totalRobux: passes.reduce((sum, p) => sum + p.price, 0),
  };
}

/** The stored JSON form of a catalog's pass list. */
export function serializePasses(passes: CatalogPass[]): string {
  return JSON.stringify(passes.map((p) => ({ id: p.id, name: p.name, price: p.price })));
}

/** Parse a stored pass list; a malformed value reads as no passes. */
export function parsePasses(json: string): CatalogPass[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (p): p is CatalogPass =>
        typeof p?.id === "number" && typeof p?.name === "string" && typeof p?.price === "number",
    );
  } catch {
    return [];
  }
}

/** Most catalog rows one refresh run may write (Task #69's write cap). */
export const PASS_WRITE_CAP = 1500;

/** Days in a full refresh cycle: every game is checked once per cycle. */
export const PASS_REFRESH_DAYS = 7;

/** Which daily shard runs on `now`'s UTC day (0..PASS_REFRESH_DAYS-1). */
export function passShardForDay(now: Date): number {
  return Math.floor(now.getTime() / 86_400_000) % PASS_REFRESH_DAYS;
}

/** A game's shard: its universe id mod PASS_REFRESH_DAYS. */
export function passShardOf(universeId: bigint | number): number {
  return Number(BigInt(universeId) % BigInt(PASS_REFRESH_DAYS));
}

export interface StoredCatalogRef {
  passes: string;
}

export interface PassWritePlan<T> {
  inserts: T[];
  updates: T[];
  unchanged: number;
  /** Changed catalogs left for next week because the run hit its write cap. */
  deferred: number;
}

/**
 * Decide which fetched catalogs to write: new rows for games never checked,
 * updates only where the serialized list differs, at most `cap` writes in all.
 * Inserts go first, so a game gets its first catalog before an existing one is
 * refreshed.
 */
export function planPassWrites<T extends { gameId: string; catalog: PassCatalog }>(
  fetched: T[],
  stored: Map<string, StoredCatalogRef>,
  cap: number,
): PassWritePlan<T> {
  const inserts: T[] = [];
  const updates: T[] = [];
  let unchanged = 0;
  for (const f of fetched) {
    const prev = stored.get(f.gameId);
    if (!prev) inserts.push(f);
    else if (prev.passes !== serializePasses(f.catalog.passes)) updates.push(f);
    else unchanged++;
  }
  const keptInserts = inserts.slice(0, Math.max(0, cap));
  const keptUpdates = updates.slice(0, Math.max(0, cap - keptInserts.length));
  return {
    inserts: keptInserts,
    updates: keptUpdates,
    unchanged,
    deferred: inserts.length + updates.length - keptInserts.length - keptUpdates.length,
  };
}
