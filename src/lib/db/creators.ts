import { prisma } from "@/lib/prisma";
import type { CreatorRef } from "@/lib/creators";

/**
 * Every tracked game by one creator (Task #67), most played first. One read on
 * the (creatorId) index; the type is checked too, because a user and a group
 * can share a numeric id.
 */
export function getCreatorGames(creator: CreatorRef) {
  return prisma.game.findMany({
    where: { creatorId: creator.id, creatorType: creator.type },
    orderBy: { currentPlaying: "desc" },
    select: {
      id: true,
      universeId: true,
      name: true,
      creatorName: true,
      lastCollectedAt: true,
      currentPlaying: true,
      allTimePeakPlayers: true,
      currentVisits: true,
      status: true,
      firstSeenAt: true,
      currentGenre: { select: { id: true, slug: true, name: true } },
    },
  });
}
