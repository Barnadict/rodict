import { cacheLife } from "next/cache";

import { getGenreBySlug } from "@/lib/db/genres";
import { getGenreStatBySlug } from "@/lib/db/genre-stats";
import { formatCompact } from "@/lib/format";

/**
 * A genre's title/description/share-image data (Task #72), shared by
 * `generateMetadata` and `opengraph-image.tsx`, so neither pays for the full
 * 13-query page read.
 */
export async function getGenreShare(slug: string) {
  "use cache";
  cacheLife("hours");

  const [genre, stat] = await Promise.all([getGenreBySlug(slug), getGenreStatBySlug(slug)]);
  if (!genre) return null;

  const description =
    `Roblox ${genre.name} games: ` +
    (stat
      ? `${formatCompact(stat.gameCount)} tracked, ${formatCompact(stat.totalPlaying)} playing now. `
      : "") +
    "Player trends, survival, seasonality and estimated earnings on rodict.";

  return { genre, stat, description };
}
