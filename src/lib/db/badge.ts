import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * One game for its badge (Task #93), in one statement. With `withRank`, rank
 * is 1 + the games with more players now, counted on the currentPlaying index
 * inside the same query (so a game ranked #N reads ~N index entries); games
 * with nobody playing are unranked.
 */
export async function getBadgeGame(universeId: bigint, withRank: boolean) {
  const rank = withRank
    ? Prisma.sql`CASE WHEN g."currentPlaying" > 0 THEN 1 + (SELECT COUNT(*) FROM "Game" o
        WHERE o."currentPlaying" > g."currentPlaying") END`
    : Prisma.sql`NULL`;
  const rows = await prisma.$queryRaw<
    { name: string; currentPlaying: number | bigint; rank: number | bigint | null }[]
  >`
    SELECT g.name AS "name", g."currentPlaying" AS "currentPlaying", ${rank} AS "rank"
    FROM "Game" g
    WHERE g."universeId" = ${universeId}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    name: r.name,
    currentPlaying: Number(r.currentPlaying),
    rank: r.rank === null ? null : Number(r.rank),
  };
}
