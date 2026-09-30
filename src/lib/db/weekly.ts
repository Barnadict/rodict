import { prisma } from "@/lib/prisma";
import { WEEKLY_LIMIT } from "@/lib/weekly";

/**
 * Games new on Roblox or first tracked since `cutoff`, most played first
 * (Task #92). The same rule as /new, without its snapshot read: the recap only
 * lists them. Two reads on Game (the list and its count).
 */
export async function getWeeklyEntrants(cutoff: Date) {
  const where = { OR: [{ robloxCreatedAt: { gte: cutoff } }, { firstSeenAt: { gte: cutoff } }] };
  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: { currentPlaying: "desc" },
      take: WEEKLY_LIMIT,
      select: {
        id: true,
        universeId: true,
        name: true,
        robloxCreatedAt: true,
        currentPlaying: true,
        currentGenre: { select: { slug: true, name: true } },
      },
    }),
    prisma.game.count({ where }),
  ]);
  return { games, total };
}

/**
 * Games that became dead by our rule since `cutoff` (the Game.status the
 * game_status job keeps), biggest all-time peak first. One read on the status
 * index, like /graveyard, but only this window's deaths.
 */
export async function getWeeklyDeaths(cutoff: Date) {
  const where = { status: "dead", deadSince: { gte: cutoff } };
  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: { allTimePeakPlayers: "desc" },
      take: WEEKLY_LIMIT,
      select: {
        id: true,
        universeId: true,
        name: true,
        deadSince: true,
        allTimePeakPlayers: true,
        currentGenre: { select: { slug: true, name: true } },
      },
    }),
    prisma.game.count({ where }),
  ]);
  return { games: games.map((g) => ({ ...g, deadSince: g.deadSince! })), total };
}
