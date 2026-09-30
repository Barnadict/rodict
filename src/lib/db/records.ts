import { prisma } from "@/lib/prisma";
import { NEAR_LAUNCH_DAYS } from "@/lib/launch-benchmark";
import { LONGEVITY_MIN_PLAYERS, RECORDS_LIMIT, topMoves } from "@/lib/records";

const GAME_SELECT = {
  id: true,
  universeId: true,
  name: true,
  status: true,
  currentGenre: { select: { slug: true, name: true } },
} as const;

/** Highest observed all-time peaks. One read on the allTimePeakPlayers index. */
export function getPeakRecords() {
  return prisma.game.findMany({
    orderBy: { allTimePeakPlayers: "desc" },
    take: RECORDS_LIMIT,
    select: { ...GAME_SELECT, allTimePeakPlayers: true, allTimePeakAt: true },
  });
}

/**
 * The biggest flagged jumps and collapses (Task #25's stored change_point
 * payloads, one row per game with anomalies, ~600), with the games they belong
 * to. Two reads: the payloads, then the ≤ 2 × RECORDS_LIMIT games by id.
 */
export async function getMoveRecords() {
  const rows = await prisma.analyticsResult.findMany({
    where: { kind: "change_point", scopeType: "game", scopeId: { not: null } },
    select: { scopeId: true, payload: true },
  });
  const { gains, collapses } = topMoves(
    rows.map((r) => ({ gameId: r.scopeId!, payload: r.payload })),
  );
  const ids = [...new Set([...gains, ...collapses].map((m) => m.gameId))];
  const games = await prisma.game.findMany({ where: { id: { in: ids } }, select: GAME_SELECT });
  const byId = new Map(games.map((g) => [g.id, g]));
  const attach = (moves: typeof gains) =>
    moves.flatMap((m) => {
      const game = byId.get(m.gameId);
      return game ? [{ ...m, game }] : [];
    });
  return { gains: attach(gains), collapses: attach(collapses) };
}

/**
 * Games tracked from near launch that reached `threshold` players, with when
 * they first did. The game filter (peak ≥ threshold, first seen within
 * NEAR_LAUNCH_DAYS of creation) keeps this to few games; each then costs one
 * range scan of its own readings on the (gameId, collectedAt) index.
 */
export async function getSpeedCandidates(threshold: number) {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      universeId: bigint;
      name: string;
      status: string;
      genreSlug: string | null;
      genreName: string | null;
      createdAt: string | Date;
      reachedAt: string | Date | null;
      firstAt: string | Date | null;
    }[]
  >`
    SELECT g.id, g."universeId", g.name, g.status,
      gen.slug AS "genreSlug", gen.name AS "genreName",
      g."robloxCreatedAt" AS "createdAt",
      (SELECT MIN(s."collectedAt") FROM "GameSnapshot" s
        WHERE s."gameId" = g.id AND s.playing >= ${threshold}) AS "reachedAt",
      (SELECT MIN(s."collectedAt") FROM "GameSnapshot" s
        WHERE s."gameId" = g.id) AS "firstAt"
    FROM "Game" g
    LEFT JOIN "Genre" gen ON gen.id = g."currentGenreId"
    WHERE g."allTimePeakPlayers" >= ${threshold}
      AND g."robloxCreatedAt" IS NOT NULL
      AND julianday(g."firstSeenAt") - julianday(g."robloxCreatedAt") <= ${NEAR_LAUNCH_DAYS}
  `;
  // A plain column may come back as a Date, an aggregate as SQLite's text.
  return rows.flatMap((r) =>
    r.reachedAt && r.firstAt
      ? [
          {
            id: r.id,
            universeId: r.universeId,
            name: r.name,
            status: r.status,
            genre: r.genreSlug ? { slug: r.genreSlug, name: r.genreName ?? r.genreSlug } : null,
            createdAt: new Date(r.createdAt),
            reachedAt: new Date(r.reachedAt),
            firstAt: new Date(r.firstAt),
          },
        ]
      : [],
  );
}

/** Oldest games still active with at least LONGEVITY_MIN_PLAYERS playing now. */
export function getLongevityRecords() {
  return prisma.game.findMany({
    where: {
      status: "active",
      currentPlaying: { gte: LONGEVITY_MIN_PLAYERS },
      robloxCreatedAt: { not: null },
    },
    orderBy: { robloxCreatedAt: "asc" },
    take: RECORDS_LIMIT,
    select: { ...GAME_SELECT, robloxCreatedAt: true, currentPlaying: true },
  });
}
