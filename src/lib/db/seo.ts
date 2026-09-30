import { prisma } from "@/lib/prisma";

/**
 * Reads for the sitemap and share metadata (Task #72). All narrow selects on
 * indexed columns; callers wrap them in `use cache`.
 */

/** Top games by current players, for the sitemap. Uses the currentPlaying index. */
export function getSitemapGames(limit: number) {
  return prisma.game.findMany({
    orderBy: { currentPlaying: "desc" },
    take: limit,
    select: { universeId: true, lastSnapshotAt: true },
  });
}

/** Just what a game's title, description and share image need. */
export function getGameShareInfo(universeId: bigint) {
  return prisma.game.findUnique({
    where: { universeId },
    select: {
      name: true,
      description: true,
      creatorName: true,
      currentPlaying: true,
      currentVisits: true,
      allTimePeakPlayers: true,
      status: true,
      currentGenre: { select: { name: true } },
    },
  });
}

/** Parse a universe id route param; null when it isn't a positive integer. */
export function parseUniverseIdParam(param: string): bigint | null {
  if (!/^\d{1,20}$/.test(param)) return null;
  return BigInt(param);
}
