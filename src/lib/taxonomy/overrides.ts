/**
 * Manual genre/theme overrides for specific games that the automatic mapping
 * gets wrong (mislabeled Roblox tags, misleading names, etc.).
 *
 * Keyed by Roblox `universeId`. These take priority over every other signal.
 * When the collector (Task #8) applies one, it records the genre as a
 * GameGenreHistory row with `source = "manual"`.
 *
 * This is intentionally a small, hand-curated code map — the site is
 * single-owner for now, so editing + redeploying is fine. If the override list
 * grows large or needs editing without a deploy, it can move to a DB table
 * later without changing the resolver's contract.
 */

import type { GenreSlug } from "./genres";
import type { ThemeSlug } from "./themes";

export interface GenreOverride {
  /** Force this genre (omit to only override themes). */
  genre?: GenreSlug;
  /** Force this exact theme set (omit to leave automatic theme detection). */
  themes?: ThemeSlug[];
  /** Why the override exists — for future maintainers. */
  note?: string;
}

// Example (keep commented until we have a real mislabeled game to fix):
//   4801952948n: { genre: "rpg", note: "Roblox tags it 'Adventure' but it's a full RPG" },
export const MANUAL_GENRE_OVERRIDES: Record<string, GenreOverride> = {
  // universeId (as string) : { genre, themes, note }
};

/** Look up a manual override by universeId (BigInt or string). */
export function getManualOverride(universeId: bigint | string): GenreOverride | undefined {
  return MANUAL_GENRE_OVERRIDES[universeId.toString()];
}
