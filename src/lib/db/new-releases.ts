import { prisma } from "@/lib/prisma";
import { TS_FORMAT } from "@/lib/db/trends";
import { NEW_RELEASES_LIMIT, summarizeLifecycle, type Reading } from "@/lib/new-releases";

const DAY_MS = 86_400_000;

/**
 * Games created on Roblox or first tracked since `cutoff` (Task #66), most
 * played first, with their last 8 days of readings for the weekly change. Two
 * reads: the games (robloxCreatedAt / firstSeenAt), then one snapshot range on
 * the (gameId, collectedAt) index. Capped at NEW_RELEASES_LIMIT games.
 */
export async function getNewReleases(cutoff: Date, now: Date) {
  const games = await prisma.game.findMany({
    where: { OR: [{ robloxCreatedAt: { gte: cutoff } }, { firstSeenAt: { gte: cutoff } }] },
    orderBy: { currentPlaying: "desc" },
    take: NEW_RELEASES_LIMIT,
    select: {
      id: true,
      universeId: true,
      name: true,
      status: true,
      robloxCreatedAt: true,
      firstSeenAt: true,
      currentPlaying: true,
      currentGenreId: true,
      currentGenre: { select: { slug: true, name: true } },
    },
  });
  const [total, snapshots] = await Promise.all([
    prisma.game.count({
      where: { OR: [{ robloxCreatedAt: { gte: cutoff } }, { firstSeenAt: { gte: cutoff } }] },
    }),
    games.length
      ? prisma.gameSnapshot.findMany({
          where: {
            gameId: { in: games.map((g) => g.id) },
            collectedAt: { gte: new Date(now.getTime() - 8 * DAY_MS) },
          },
          select: { gameId: true, collectedAt: true, playing: true },
        })
      : Promise.resolve([]),
  ]);
  const readings = new Map<string, Reading[]>();
  for (const s of snapshots) {
    const list = readings.get(s.gameId) ?? [];
    list.push({ t: s.collectedAt.getTime(), playing: s.playing });
    readings.set(s.gameId, list);
  }
  return {
    total,
    games: games.map((g) => ({ ...g, recent: readings.get(g.id) ?? [] })),
  };
}

/** One game's readings in its first `maxDays` since launch, for its early curve. */
export async function getEarlyReadings(gameId: string, createdAt: Date, maxDays: number) {
  const rows = await prisma.gameSnapshot.findMany({
    where: {
      gameId,
      collectedAt: { gte: createdAt, lt: new Date(createdAt.getTime() + (maxDays + 1) * DAY_MS) },
    },
    orderBy: { collectedAt: "asc" },
    select: { collectedAt: true, playing: true },
  });
  return rows.map((r) => ({ t: r.collectedAt.getTime(), playing: r.playing }));
}

/**
 * The genre's early curve: each of its games' daily average players by day
 * since launch, over days 0…maxDays, summarized to median + middle half per day
 * (the day-granular version of getGenreLifecycle). Only games launched after
 * collection began, minus maxDays, can have readings that young, so the game
 * scan is bounded by that, and each game's snapshot read by its launch window
 * on the (gameId, collectedAt) index. `excludeGameId` keeps the game being
 * compared out of its own baseline.
 */
export async function getGenreEarlyLifecycle(
  genreId: string,
  maxDays: number,
  excludeGameId?: string,
) {
  const first = await prisma.gameSnapshot.aggregate({ _min: { collectedAt: true } });
  const firstAt = first._min.collectedAt;
  if (!firstAt) return [];
  const earliestLaunch = new Date(firstAt.getTime() - maxDays * DAY_MS);

  const rows = await prisma.$queryRaw<{ gameId: string; day: number | bigint; avg: number }[]>`
    SELECT s."gameId" AS "gameId",
      CAST(julianday(s."collectedAt") - julianday(g."robloxCreatedAt") AS INTEGER) AS "day",
      AVG(s.playing) AS "avg"
    FROM "Game" g
    JOIN "GameSnapshot" s ON s."gameId" = g.id
      AND s."collectedAt" >= g."robloxCreatedAt"
      AND s."collectedAt" < strftime(${TS_FORMAT}, julianday(g."robloxCreatedAt") + ${maxDays + 1})
    WHERE g."currentGenreId" = ${genreId}
      AND g."robloxCreatedAt" >= ${earliestLaunch}
      AND g.id <> ${excludeGameId ?? ""}
    GROUP BY s."gameId", "day"
  `;
  return summarizeLifecycle(
    rows.map((r) => ({ gameId: r.gameId, day: Number(r.day), avg: Number(r.avg) })),
  );
}
