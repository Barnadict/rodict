import { GENRES, GENRE_SLUGS } from "@/lib/taxonomy/genres";

/**
 * One color per genre (Task #106), so a genre looks the same on chips, badges
 * and chart lines everywhere. The values are CSS variables in globals.css
 * (`--genre-<slug>`), stepped separately for light and dark mode. Unknown or
 * missing genres get the neutral `--genre-none`.
 */

const SLUGS = new Set<string>(GENRE_SLUGS);
const SLUG_BY_NAME = new Map(GENRES.map((g) => [g.name.toLowerCase(), g.slug]));

/** The genre's slug, from either its slug or its display name. */
export function genreSlugOf(slugOrName: string | null | undefined): string | null {
  if (!slugOrName) return null;
  if (SLUGS.has(slugOrName)) return slugOrName;
  return SLUG_BY_NAME.get(slugOrName.toLowerCase()) ?? null;
}

/** CSS color for a genre, by slug or display name. */
export function genreColor(slugOrName: string | null | undefined): string {
  const slug = genreSlugOf(slugOrName);
  return slug ? `var(--genre-${slug})` : "var(--genre-none)";
}
