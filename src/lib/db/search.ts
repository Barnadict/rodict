import { prisma } from "@/lib/prisma";
import { buildCreatorRows, type SearchIndex } from "@/lib/search";

/**
 * The ⌘K search index (Task #70): one read of the Game name/creator columns
 * plus the genre and theme lists. Games are ordered busiest first so a
 * truncated client list would still keep the ones people look for.
 */
export async function buildSearchIndex(): Promise<SearchIndex> {
  const [games, genres, themes] = await Promise.all([
    prisma.game.findMany({
      select: {
        universeId: true,
        name: true,
        currentPlaying: true,
        creatorId: true,
        creatorType: true,
        creatorName: true,
      },
      orderBy: { currentPlaying: "desc" },
    }),
    prisma.genre.findMany({ where: { isActive: true }, select: { slug: true, name: true } }),
    prisma.theme.findMany({ where: { isActive: true }, select: { slug: true, name: true } }),
  ]);
  return {
    games: games.map((g) => [g.universeId.toString(), g.name, g.currentPlaying]),
    genres: genres.map((g) => [g.slug, g.name]),
    themes: themes.map((t) => [t.slug, t.name]),
    creators: buildCreatorRows(games),
  };
}
