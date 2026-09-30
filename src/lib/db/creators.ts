import { prisma } from "@/lib/prisma";
import { HIT_PEAK_PLAYERS, type CreatorRef, type CreatorRow } from "@/lib/creators";
import type { CreatorType } from "@/lib/db-constants";

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

/**
 * Every creator with a tracked game (Task #86), with their game counts, current
 * players and hits. One grouped scan of Game. The name is the one on their most
 * recently collected game: SQLite fills a bare column from the row that won the
 * query's single MAX().
 */
export async function getCreatorLeaderboard(): Promise<CreatorRow[]> {
  const rows = await prisma.$queryRaw<
    {
      type: string;
      id: bigint;
      name: string | null;
      games: number | bigint;
      active: number | bigint;
      totalPlaying: number | bigint;
      hits: number | bigint;
    }[]
  >`
    SELECT "creatorType" AS "type", "creatorId" AS "id", "creatorName" AS "name",
      MAX("lastCollectedAt") AS "lastAt",
      COUNT(*) AS "games",
      SUM(CASE WHEN status = 'dead' THEN 0 ELSE 1 END) AS "active",
      SUM("currentPlaying") AS "totalPlaying",
      SUM(CASE WHEN "allTimePeakPlayers" >= ${HIT_PEAK_PLAYERS} THEN 1 ELSE 0 END) AS "hits"
    FROM "Game"
    WHERE "creatorId" IS NOT NULL AND "creatorType" IN ('User', 'Group')
    GROUP BY "creatorType", "creatorId"
  `;
  return rows.map((r) => ({
    type: r.type as CreatorType,
    id: BigInt(r.id),
    name: r.name,
    games: Number(r.games),
    active: Number(r.active),
    totalPlaying: Number(r.totalPlaying),
    hits: Number(r.hits),
  }));
}
