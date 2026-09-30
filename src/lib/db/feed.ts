import { prisma } from "@/lib/prisma";
import type { GameAnomalies } from "@/lib/db/analytics";
import type { FeedSelection, FeedSubject } from "@/lib/feed";
import type { Reading } from "@/lib/new-releases";

const DAY_MS = 86_400_000;

function parseAnomalies(payload: string): GameAnomalies["anomalies"] {
  try {
    return (JSON.parse(payload) as GameAnomalies).anomalies ?? [];
  } catch {
    return [];
  }
}

function group<T extends { key: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.key) ?? [];
    list.push(r);
    out.set(r.key, list);
  }
  return out;
}

/**
 * Everything the watchlist feed needs (Task #68), in five reads however many
 * ids are asked for: the games and genres, their change_point payloads (one
 * per series that has any), and 8 days of readings for the weekly change, on
 * the (gameId, collectedAt) and (genreId, collectedAt) indexes. Unknown ids are
 * left out.
 */
export async function getFeedSubjects(sel: FeedSelection, now: Date): Promise<FeedSubject[]> {
  const since = new Date(now.getTime() - 8 * DAY_MS);
  const universeIds = sel.games.map((id) => BigInt(id));

  const [games, genres] = await Promise.all([
    universeIds.length
      ? prisma.game.findMany({
          where: { universeId: { in: universeIds } },
          select: { id: true, universeId: true, name: true },
        })
      : Promise.resolve([]),
    sel.genres.length
      ? prisma.genre.findMany({
          where: { slug: { in: sel.genres } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const gameIds = games.map((g) => g.id);
  const genreIds = genres.map((g) => g.id);
  const scopeIds = [...gameIds, ...genreIds];

  const [results, gameSnaps, genreSnaps] = await Promise.all([
    scopeIds.length
      ? prisma.analyticsResult.findMany({
          where: {
            kind: "change_point",
            scopeType: { in: ["game", "genre"] },
            scopeId: { in: scopeIds },
          },
          orderBy: { computedAt: "desc" },
          select: { scopeId: true, payload: true },
        })
      : Promise.resolve([]),
    gameIds.length
      ? prisma.gameSnapshot.findMany({
          where: { gameId: { in: gameIds }, collectedAt: { gte: since } },
          select: { gameId: true, collectedAt: true, playing: true },
        })
      : Promise.resolve([]),
    genreIds.length
      ? prisma.genreSnapshot.findMany({
          where: { genreId: { in: genreIds }, collectedAt: { gte: since } },
          select: { genreId: true, collectedAt: true, totalPlaying: true },
        })
      : Promise.resolve([]),
  ]);

  // Newest first, so the first payload seen per scope is its latest.
  const anomalies = new Map<string, GameAnomalies["anomalies"]>();
  for (const r of results) {
    if (r.scopeId && !anomalies.has(r.scopeId)) anomalies.set(r.scopeId, parseAnomalies(r.payload));
  }
  const toReadings = (rows: { collectedAt: Date; playing: number }[]): Reading[] =>
    rows.map((r) => ({ t: r.collectedAt.getTime(), playing: r.playing }));
  const byGame = group(gameSnaps.map((s) => ({ ...s, key: s.gameId })));
  const byGenre = group(
    genreSnaps.map((s) => ({
      key: s.genreId,
      collectedAt: s.collectedAt,
      playing: s.totalPlaying,
    })),
  );

  return [
    ...games.map((g) => ({
      kind: "game" as const,
      id: g.universeId.toString(),
      name: g.name,
      anomalies: anomalies.get(g.id) ?? [],
      readings: toReadings(byGame.get(g.id) ?? []),
    })),
    ...genres.map((g) => ({
      kind: "genre" as const,
      id: g.slug,
      name: g.name,
      anomalies: anomalies.get(g.id) ?? [],
      readings: toReadings(byGenre.get(g.id) ?? []),
    })),
  ];
}
