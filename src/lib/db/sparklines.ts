import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { sparkCutoff, sparkDays, toSparkSeries } from "@/lib/sparkline";

/**
 * 7-day sparklines for the rows a page is showing (Task #102): one grouped
 * query per call, daily average players per game over the last 7 UTC days.
 * Reads ~a week of snapshots for just these ids on the (gameId, collectedAt)
 * index, so callers pass only the visible rows and call it from inside their
 * cached loader. `collectedAt` is ISO text, so its first 10 chars are the UTC day.
 */
export async function getGameSparklines(
  gameIds: string[],
  now: Date = new Date(),
): Promise<Record<string, (number | null)[]>> {
  const days = sparkDays(now);
  if (gameIds.length === 0) return {};
  const rows = await prisma.$queryRaw<{ id: string; day: string; avg: number }[]>`
    SELECT "gameId" AS id, substr("collectedAt", 1, 10) AS day, AVG(playing) AS avg
    FROM "GameSnapshot"
    WHERE "gameId" IN (${Prisma.join(gameIds)}) AND "collectedAt" >= ${sparkCutoff(now)}
    GROUP BY "gameId", day
  `;
  return toSparkSeries(rows, gameIds, days);
}

/** The genre counterpart, over GenreSnapshot.totalPlaying. */
export async function getGenreSparklines(
  genreIds: string[],
  now: Date = new Date(),
): Promise<Record<string, (number | null)[]>> {
  const days = sparkDays(now);
  if (genreIds.length === 0) return {};
  const rows = await prisma.$queryRaw<{ id: string; day: string; avg: number }[]>`
    SELECT "genreId" AS id, substr("collectedAt", 1, 10) AS day, AVG("totalPlaying") AS avg
    FROM "GenreSnapshot"
    WHERE "genreId" IN (${Prisma.join(genreIds)}) AND "collectedAt" >= ${sparkCutoff(now)}
    GROUP BY "genreId", day
  `;
  return toSparkSeries(rows, genreIds, days);
}
