import { prisma } from "@/lib/prisma";

/**
 * Every game that's dead by our rule now (Game.status, kept in step by the
 * game_status analytics job). One read on the status index; the page sorts
 * and filters in memory, so every sort and genre shares this read.
 */
export async function getDeadGames() {
  const rows = await prisma.game.findMany({
    where: { status: "dead", deadSince: { not: null } },
    select: {
      id: true,
      universeId: true,
      name: true,
      deadSince: true,
      robloxCreatedAt: true,
      allTimePeakAt: true,
      allTimePeakPlayers: true,
      currentPlaying: true,
      currentGenre: { select: { slug: true, name: true } },
    },
  });
  return rows.map((r) => ({ ...r, deadSince: r.deadSince! }));
}
