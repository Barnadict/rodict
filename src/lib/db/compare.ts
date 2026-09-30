import { prisma } from "@/lib/prisma";
import { getGenreStats } from "@/lib/db/genre-stats";

/**
 * Reads for the compare view (Task #65): at most COMPARE_MAX games or genres,
 * each one indexed read for the entities and one for their series over the
 * range (the (gameId|genreId, collectedAt) unique indexes). Only the columns the
 * chart and stat cards use are selected.
 */

export async function getCompareGames(universeIds: string[], from?: Date) {
  if (universeIds.length === 0) return [];
  const games = await prisma.game.findMany({
    where: { universeId: { in: universeIds.map((id) => BigInt(id)) } },
    include: {
      currentGenre: { select: { slug: true, name: true } },
      passCatalog: { select: { forSaleCount: true, totalRobux: true } },
    },
  });
  const snapshots = games.length
    ? await prisma.gameSnapshot.findMany({
        where: {
          gameId: { in: games.map((g) => g.id) },
          ...(from ? { collectedAt: { gte: from } } : {}),
        },
        orderBy: { collectedAt: "asc" },
        select: { gameId: true, collectedAt: true, playing: true },
      })
    : [];
  const byId = new Map(games.map((g) => [g.universeId.toString(), g]));
  // Keep the URL's order: it decides each series' colour.
  return universeIds.flatMap((id) => {
    const game = byId.get(id);
    if (!game) return [];
    const points = snapshots
      .filter((s) => s.gameId === game.id)
      .map((s) => ({ t: s.collectedAt.getTime(), value: s.playing }));
    return [{ game, points }];
  });
}

export async function getCompareGenres(slugs: string[], from?: Date) {
  if (slugs.length === 0) return [];
  const genres = await prisma.genre.findMany({ where: { slug: { in: slugs } } });
  const [stats, snapshots] = await Promise.all([
    getGenreStats(),
    genres.length
      ? prisma.genreSnapshot.findMany({
          where: {
            genreId: { in: genres.map((g) => g.id) },
            ...(from ? { collectedAt: { gte: from } } : {}),
          },
          orderBy: { collectedAt: "asc" },
          select: { genreId: true, collectedAt: true, totalPlaying: true },
        })
      : Promise.resolve([]),
  ]);
  const bySlug = new Map(genres.map((g) => [g.slug, g]));
  return slugs.flatMap((slug) => {
    const genre = bySlug.get(slug);
    if (!genre) return [];
    const points = snapshots
      .filter((s) => s.genreId === genre.id)
      .map((s) => ({ t: s.collectedAt.getTime(), value: s.totalPlaying }));
    return [{ genre, stat: stats.find((r) => r.genreId === genre.id) ?? null, points }];
  });
}
