import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { CleanGame } from "@/lib/validation/sanitize";

// ---------------------------------------------------------------------------
// Write path (used by the collector, Task #8)
// ---------------------------------------------------------------------------

export interface PersistInput {
  game: CleanGame;
  /** One timestamp shared by every row in a collection run (UTC). */
  collectedAt: Date;
  /** Resolved genre DB id, or null when the taxonomy couldn't classify it. */
  genreId: string | null;
  /** How the genre was decided ("roblox_tag" | "manual" | "inferred"). */
  genreSource: string;
  /** Resolved theme DB ids (current set). */
  themeIds: string[];
}

export interface PersistResult {
  gameId: string;
  isNew: boolean;
  peakUpdated: boolean;
  genreChanged: boolean;
}

/**
 * Upsert a game, append its raw snapshot, roll the all-time peak, mirror the
 * denormalized current metrics, and record genre/theme assignments — all in one
 * transaction so a game is never left half-updated.
 */
export async function persistCollectedGame(input: PersistInput): Promise<PersistResult> {
  const { game, collectedAt, genreId, genreSource, themeIds } = input;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.game.findUnique({
      where: { universeId: game.universeId },
      select: { id: true, allTimePeakPlayers: true, currentGenreId: true },
    });

    const isNew = existing === null;
    const peakUpdated = game.playing > (existing?.allTimePeakPlayers ?? 0);
    const genreChanged = genreId !== null && genreId !== (existing?.currentGenreId ?? null);

    const commonData = {
      rootPlaceId: game.rootPlaceId,
      name: game.name,
      description: game.description,
      creatorId: game.creatorId,
      creatorName: game.creatorName,
      creatorType: game.creatorType,
      robloxCreatedAt: game.robloxCreatedAt,
      robloxUpdatedAt: game.robloxUpdatedAt,
      lastCollectedAt: collectedAt,
      lastSnapshotAt: collectedAt,
      currentPlaying: game.playing,
      currentVisits: game.visits,
      currentFavorites: game.favorites,
      currentUpVotes: game.upVotes,
      currentDownVotes: game.downVotes,
      ...(peakUpdated ? { allTimePeakPlayers: game.playing, allTimePeakAt: collectedAt } : {}),
      ...(genreId !== null ? { currentGenreId: genreId } : {}),
    } satisfies Prisma.GameUncheckedUpdateInput;

    const record = await tx.game.upsert({
      where: { universeId: game.universeId },
      create: {
        universeId: game.universeId,
        firstSeenAt: collectedAt,
        ...commonData,
      },
      update: commonData,
      select: { id: true },
    });

    await tx.gameSnapshot.create({
      data: {
        gameId: record.id,
        collectedAt,
        playing: game.playing,
        visits: game.visits,
        favorites: game.favorites,
        upVotes: game.upVotes,
        downVotes: game.downVotes,
        maxPlayers: game.maxPlayers,
      },
    });

    if (genreChanged) {
      // Close the previous open assignment, then open a new one.
      await tx.gameGenreHistory.updateMany({
        where: { gameId: record.id, endedAt: null },
        data: { endedAt: collectedAt },
      });
      await tx.gameGenreHistory.create({
        data: {
          gameId: record.id,
          genreId: genreId!,
          assignedAt: collectedAt,
          source: genreSource,
        },
      });
    }

    // Sync the current theme set (add missing, remove gone).
    const currentThemes = await tx.gameTheme.findMany({
      where: { gameId: record.id },
      select: { themeId: true },
    });
    const currentIds = new Set(currentThemes.map((t) => t.themeId));
    const wanted = new Set(themeIds);
    const toAdd = themeIds.filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !wanted.has(id));
    if (toAdd.length) {
      await tx.gameTheme.createMany({
        data: toAdd.map((themeId) => ({ gameId: record.id, themeId })),
      });
    }
    if (toRemove.length) {
      await tx.gameTheme.deleteMany({
        where: { gameId: record.id, themeId: { in: toRemove } },
      });
    }

    return { gameId: record.id, isNew, peakUpdated, genreChanged };
  });
}

/** Universe ids of every game we already track — so the collector keeps
 * following them as they decline (survivorship-bias guard). */
export async function getKnownUniverseIds(): Promise<bigint[]> {
  const rows = await prisma.game.findMany({ select: { universeId: true } });
  return rows.map((r) => r.universeId);
}

// ---------------------------------------------------------------------------
// Read path (used by pages + analytics)
// ---------------------------------------------------------------------------

/** When the collector last ran, or null if it's never run — a transparency
 * signal for the dashboard (full failure monitoring is Task #34). */
export async function getLastCollectedAt(): Promise<Date | null> {
  const result = await prisma.game.aggregate({ _max: { lastCollectedAt: true } });
  return result._max.lastCollectedAt;
}

export type GameSortField =
  "currentPlaying" | "currentVisits" | "currentFavorites" | "allTimePeakPlayers" | "firstSeenAt";

export interface GamesListParams {
  genreSlug?: string;
  status?: string;
  search?: string;
  sort?: GameSortField;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** The core games-list query — reads denormalized current metrics only, no
 * per-row snapshot join. */
export async function getGamesList(params: GamesListParams = {}) {
  const {
    genreSlug,
    status,
    search,
    sort = "currentPlaying",
    order = "desc",
    limit = 50,
    offset = 0,
  } = params;

  const where: Prisma.GameWhereInput = {
    ...(genreSlug ? { currentGenre: { slug: genreSlug } } : {}),
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search } } : {}),
  };

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: { [sort]: order },
      take: Math.min(limit, 200),
      skip: offset,
      include: { currentGenre: true },
    }),
    prisma.game.count({ where }),
  ]);

  return { games, total };
}

export function getGameByUniverseId(universeId: bigint | number) {
  return prisma.game.findUnique({
    where: { universeId: BigInt(universeId) },
    include: { currentGenre: true, themes: { include: { theme: true } } },
  });
}

export interface SnapshotRange {
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Time series for one game, oldest-first (for charts). */
export function getGameSnapshots(gameId: string, range: SnapshotRange = {}) {
  const { from, to, limit } = range;
  return prisma.gameSnapshot.findMany({
    where: {
      gameId,
      ...(from || to
        ? { collectedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { collectedAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });
}

export function countGames(where: Prisma.GameWhereInput = {}) {
  return prisma.game.count({ where });
}
