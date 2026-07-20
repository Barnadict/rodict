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

export interface BulkPersistSummary {
  persisted: number;
  newGames: number;
  peaksUpdated: number;
  genreChanges: number;
}

/** The subset of an existing Game row the write planner needs to decide what
 * changed. Pre-read in bulk so no per-game SELECT is needed. */
export interface ExistingGameRef {
  id: string;
  allTimePeakPlayers: number;
  currentGenreId: string | null;
}

export interface GameWriteDecision {
  isNew: boolean;
  peakUpdated: boolean;
  /** True when the resolved genre differs from what's currently stored. For a
   * new game with a resolved genre this is true (it opens the first history). */
  genreChanged: boolean;
}

/**
 * Pure decision logic for one game: is it new, did its all-time peak roll, did
 * its genre change? Extracted so it can be unit-tested without a database — the
 * bulk writer below is otherwise just mechanical row-building around this.
 */
export function planGameWrite(
  input: Pick<PersistInput, "game" | "genreId">,
  existing: ExistingGameRef | undefined,
): GameWriteDecision {
  const { game, genreId } = input;
  return {
    isNew: existing === undefined,
    peakUpdated: game.playing > (existing?.allTimePeakPlayers ?? 0),
    genreChanged: genreId !== null && genreId !== (existing?.currentGenreId ?? null),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// SQLite/libSQL bind a parameter per column-value, so multi-row writes must be
// chunked below the variable limit. These are conservative — comfortably under
// even the old 999-variable builds, and the round-trip count stays tiny.
const CREATE_CHUNK = 200; // rows per createMany statement
const IN_CHUNK = 400; // ids per `IN (...)` read
// Ops per batched $transaction. Kept modest so each transaction stays well
// under the client's interactive-transaction timeout over the network to Turso
// (see prisma.ts) and holds its write lock only briefly.
const TX_BATCH = 50;

/**
 * Persist a whole collection run in bulk.
 *
 * The old path ran one interactive transaction per game — ~6 round trips each,
 * which is fine at a few hundred games but blows the collector's 15-minute
 * budget once the corpus is thousands (Task: scale-up). This version does the
 * same work as set operations: one pre-read, chunked `createMany`s, and batched
 * `$transaction([...])` updates (the libSQL adapter sends a batch as a handful
 * of round trips, not one per statement). It is NOT wrapped in a single global
 * transaction: at thousands of rows that would hold a long write lock on Turso.
 * A re-run is safe because every run stamps a fresh `collectedAt` (so its
 * snapshots are new rows, never collisions) and the game/genre/theme syncs
 * converge to the same state.
 */
export async function persistCollectedGames(inputs: PersistInput[]): Promise<BulkPersistSummary> {
  if (inputs.length === 0) {
    return { persisted: 0, newGames: 0, peaksUpdated: 0, genreChanges: 0 };
  }

  // --- Phase 0: one pre-read of every game we're about to touch ---------------
  const universeIds = inputs.map((i) => i.game.universeId);
  const existingByUniverse = new Map<bigint, ExistingGameRef>();
  for (const ids of chunk(universeIds, IN_CHUNK)) {
    const rows = await prisma.game.findMany({
      where: { universeId: { in: ids } },
      select: { id: true, universeId: true, allTimePeakPlayers: true, currentGenreId: true },
    });
    for (const r of rows) {
      existingByUniverse.set(r.universeId, {
        id: r.id,
        allTimePeakPlayers: r.allTimePeakPlayers,
        currentGenreId: r.currentGenreId,
      });
    }
  }

  // --- Phase 1: partition into creates vs updates, in memory ------------------
  const creates: Prisma.GameCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.GameUncheckedUpdateInput }[] = [];
  let newGames = 0;
  let peaksUpdated = 0;
  let genreChanges = 0;

  for (const input of inputs) {
    const { game, collectedAt, genreId } = input;
    const existing = existingByUniverse.get(game.universeId);
    const decision = planGameWrite(input, existing);
    if (decision.isNew) newGames++;
    if (decision.peakUpdated) peaksUpdated++;
    if (decision.genreChanged) genreChanges++;

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
      ...(decision.peakUpdated
        ? { allTimePeakPlayers: game.playing, allTimePeakAt: collectedAt }
        : {}),
      ...(genreId !== null ? { currentGenreId: genreId } : {}),
    } satisfies Prisma.GameUncheckedUpdateInput;

    if (existing) {
      updates.push({ id: existing.id, data: commonData });
    } else {
      creates.push({ universeId: game.universeId, firstSeenAt: collectedAt, ...commonData });
    }
  }

  // --- Phase 2: write the games (createMany for new, batched updates for old) --
  for (const group of chunk(creates, CREATE_CHUNK)) {
    await prisma.game.createMany({ data: group });
  }
  for (const batch of chunk(updates, TX_BATCH)) {
    await prisma.$transaction(
      batch.map((u) =>
        prisma.game.update({ where: { id: u.id }, data: u.data, select: { id: true } }),
      ),
    );
  }

  // --- Phase 3: resolve every game's id (new rows only need re-reading) -------
  const idByUniverse = new Map<bigint, string>();
  for (const [universeId, ref] of existingByUniverse) idByUniverse.set(universeId, ref.id);
  const newUniverseIds = creates.map((c) => c.universeId as bigint);
  for (const ids of chunk(newUniverseIds, IN_CHUNK)) {
    const rows = await prisma.game.findMany({
      where: { universeId: { in: ids } },
      select: { id: true, universeId: true },
    });
    for (const r of rows) idByUniverse.set(r.universeId, r.id);
  }

  // --- Phase 4: append this run's snapshots -----------------------------------
  const snapshots: Prisma.GameSnapshotCreateManyInput[] = inputs.map((input) => ({
    gameId: idByUniverse.get(input.game.universeId)!,
    collectedAt: input.collectedAt,
    playing: input.game.playing,
    visits: input.game.visits,
    favorites: input.game.favorites,
    upVotes: input.game.upVotes,
    downVotes: input.game.downVotes,
    maxPlayers: input.game.maxPlayers,
  }));
  for (const group of chunk(snapshots, CREATE_CHUNK)) {
    // No skipDuplicates: SQLite's Prisma createMany doesn't support it. It isn't
    // needed — every run stamps a fresh `collectedAt`, and universe ids are
    // deduped upstream, so the @@unique([gameId, collectedAt]) guard is never
    // actually hit within or across runs.
    await prisma.gameSnapshot.createMany({ data: group });
  }

  // --- Phase 5: genre history (close-then-open on change; open for new) -------
  const genreCloses: string[] = []; // gameIds whose open assignment must be closed
  const genreOpens: Prisma.GameGenreHistoryCreateManyInput[] = [];
  for (const input of inputs) {
    const existing = existingByUniverse.get(input.game.universeId);
    const decision = planGameWrite(input, existing);
    if (!decision.genreChanged || input.genreId === null) continue;
    const gameId = idByUniverse.get(input.game.universeId)!;
    // Only existing games can have a prior open assignment to close.
    if (existing && existing.currentGenreId !== null) genreCloses.push(gameId);
    genreOpens.push({
      gameId,
      genreId: input.genreId,
      assignedAt: input.collectedAt,
      source: input.genreSource,
    });
  }
  if (genreCloses.length) {
    const closedAt = inputs[0].collectedAt; // one timestamp per run
    for (const ids of chunk(genreCloses, IN_CHUNK)) {
      await prisma.gameGenreHistory.updateMany({
        where: { gameId: { in: ids }, endedAt: null },
        data: { endedAt: closedAt },
      });
    }
  }
  for (const group of chunk(genreOpens, CREATE_CHUNK)) {
    await prisma.gameGenreHistory.createMany({ data: group });
  }

  // --- Phase 6: sync the theme set per game (adds + removes) ------------------
  const allGameIds = inputs.map((i) => idByUniverse.get(i.game.universeId)!);
  const existingThemes = new Map<string, Set<string>>();
  for (const ids of chunk(allGameIds, IN_CHUNK)) {
    const rows = await prisma.gameTheme.findMany({
      where: { gameId: { in: ids } },
      select: { gameId: true, themeId: true },
    });
    for (const r of rows) {
      const set = existingThemes.get(r.gameId) ?? new Set<string>();
      set.add(r.themeId);
      existingThemes.set(r.gameId, set);
    }
  }
  const themeAdds: Prisma.GameThemeCreateManyInput[] = [];
  const themeRemovals: { gameId: string; themeIds: string[] }[] = [];
  for (const input of inputs) {
    const gameId = idByUniverse.get(input.game.universeId)!;
    const current = existingThemes.get(gameId) ?? new Set<string>();
    const wanted = new Set(input.themeIds);
    for (const themeId of input.themeIds)
      if (!current.has(themeId)) themeAdds.push({ gameId, themeId });
    const remove = [...current].filter((id) => !wanted.has(id));
    if (remove.length) themeRemovals.push({ gameId, themeIds: remove });
  }
  for (const group of chunk(themeAdds, CREATE_CHUNK)) {
    // Adds are already diffed against the current set above, so no row here
    // duplicates an existing (gameId, themeId) — no skipDuplicates needed
    // (SQLite's createMany wouldn't accept it anyway).
    await prisma.gameTheme.createMany({ data: group });
  }
  for (const batch of chunk(themeRemovals, TX_BATCH)) {
    await prisma.$transaction(
      batch.map((r) =>
        prisma.gameTheme.deleteMany({ where: { gameId: r.gameId, themeId: { in: r.themeIds } } }),
      ),
    );
  }

  return { persisted: inputs.length, newGames, peaksUpdated, genreChanges };
}

/** Universe ids of every game we already track — so the collector keeps
 * following them as they decline (survivorship-bias guard).
 *
 * Ordered oldest-collected-first (STALEST games first; never-collected NULLs
 * sort first in SQLite). This is a fairness mechanism for rate-limited runs:
 * fetchInBatches is sequential and in-order, and throttling worsens the deeper
 * a run gets, so the TAIL of this list is what gets skipped. Putting the stalest
 * games at the front means a partial run spends its budget on the games that
 * need it most, and the freshest games (which can afford to wait) are the ones
 * deferred — so coverage equalizes across runs instead of the same tail being
 * perpetually starved. */
export async function getKnownUniverseIds(): Promise<bigint[]> {
  const rows = await prisma.game.findMany({
    select: { universeId: true },
    orderBy: { lastCollectedAt: "asc" },
  });
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
