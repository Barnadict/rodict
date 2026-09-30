import { prisma } from "@/lib/prisma";
import { CADENCE, summarizeCadence, type UpdateCadence } from "@/lib/update-cadence";

/**
 * Update cadence for every genre (Task #88). Two reads: every game's genre and
 * last-updated time (~7K small rows), and the recorded changes of the last
 * CADENCE.historyDays on GameUpdate's updatedAt index (first sightings, which
 * have no previous timestamp, are filtered out). `growth` comes from the cached
 * /trending ranking, so it adds no reads. Callers cache the result.
 */
export async function getUpdateCadenceIndex(
  growth: Map<string, number>,
  now: Date,
): Promise<UpdateCadence> {
  const from = new Date(now.getTime() - CADENCE.historyDays * 86_400_000);
  const [games, changes] = await Promise.all([
    prisma.game.findMany({
      select: {
        id: true,
        universeId: true,
        name: true,
        currentGenreId: true,
        currentPlaying: true,
        robloxUpdatedAt: true,
      },
    }),
    prisma.gameUpdate.findMany({
      where: { updatedAt: { gte: from }, previousUpdatedAt: { not: null } },
      select: { gameId: true, updatedAt: true, previousUpdatedAt: true },
    }),
  ]);
  return summarizeCadence(
    games.map((g) => ({
      id: g.id,
      universeId: g.universeId.toString(),
      name: g.name,
      genreId: g.currentGenreId,
      currentPlaying: g.currentPlaying,
      robloxUpdatedAt: g.robloxUpdatedAt,
    })),
    changes.map((c) => ({
      gameId: c.gameId,
      updatedAt: c.updatedAt,
      previousUpdatedAt: c.previousUpdatedAt!,
    })),
    growth,
    now,
  );
}
