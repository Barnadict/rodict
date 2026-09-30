import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";

import { getAllGenres } from "@/lib/db/genres";
import { getAllThemes } from "@/lib/db/themes";
import { getSitemapGames } from "@/lib/db/seo";
import { absoluteUrl } from "@/lib/site";

/**
 * Games listed in the sitemap, busiest first. The rest of the ~5K tracked games
 * are still reachable through the lists; this keeps the sitemap to the pages
 * people actually search for and the read to one small indexed query.
 */
const SITEMAP_TOP_GAMES = 500;

const STATIC_PATHS = [
  "/",
  "/games",
  "/genres",
  "/themes",
  "/trending",
  "/new",
  "/saturation",
  "/records",
  "/graveyard",
  "/creators",
  "/updates",
  "/about",
  "/status",
];

/** Cached like the pages: the data behind it changes every few hours. */
async function getSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");

  const [genres, themes, games] = await Promise.all([
    getAllGenres(),
    getAllThemes(),
    getSitemapGames(SITEMAP_TOP_GAMES),
  ]);

  return [
    ...STATIC_PATHS.map((path) => ({ url: absoluteUrl(path) })),
    ...genres.map((g) => ({ url: absoluteUrl(`/genres/${g.slug}`) })),
    ...themes.map((t) => ({ url: absoluteUrl(`/themes/${t.slug}`) })),
    ...games.map((g) => ({
      url: absoluteUrl(`/games/${g.universeId}`),
      lastModified: g.lastSnapshotAt ?? undefined,
    })),
  ];
}

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}
