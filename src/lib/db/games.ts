import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { CleanGame } from "@/lib/validation/sanitize";
import { addWrites, type WriteCounts } from "@/lib/db/write-counts";
import { collectionTier, isDueForCollection } from "@/lib/collector/cadence";
import { rankSimilarGames, similarCcuBand } from "@/lib/game-metrics";
import { impactSnapshotRange } from "@/lib/update-impact";
import { rankByGrowth, rankByLikeRatio } from "@/lib/games-list";
import { rankBySession } from "@/lib/engagement";

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
  /** Roblox "last updated" timestamps recorded as GameUpdate events (Task #63). */
  updatesRecorded: number;
  /** Rows written per table (Task #42 write-budget accounting). */
  writes: WriteCounts;
}

/** The subset of an existing Game row the write planner needs to decide what
 * changed. Pre-read in bulk so no per-game SELECT is needed. */
export interface ExistingGameRef {
  id: string;
  allTimePeakPlayers: number;
  currentGenreId: string | null;
  robloxUpdatedAt: Date | null;
}

export interface GameWriteDecision {
  isNew: boolean;
  peakUpdated: boolean;
  /** True when the resolved genre differs from what's currently stored. For a
   * new game with a resolved genre this is true (it opens the first history). */
  genreChanged: boolean;
  /** True when the game's Roblox "last updated" timestamp is one we haven't
   * recorded yet: it moved forward, or this is the first reading (Task #63). */
  newUpdate: boolean;
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
  const updatedAt = game.robloxUpdatedAt.getTime();
  const previous = existing?.robloxUpdatedAt?.getTime() ?? null;
  return {
    isNew: existing === undefined,
    peakUpdated: game.playing > (existing?.allTimePeakPlayers ?? 0),
    genreChanged: genreId !== null && genreId !== (existing?.currentGenreId ?? null),
    // Only forward moves: an older timestamp than the stored one is Roblox
    // noise, not a new update, and could collide with a recorded event.
    newUpdate: !Number.isNaN(updatedAt) && (previous === null || updatedAt > previous),
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
    return {
      persisted: 0,
      newGames: 0,
      peaksUpdated: 0,
      genreChanges: 0,
      updatesRecorded: 0,
      writes: {},
    };
  }
  const writes: WriteCounts = {};

  // --- Phase 0: one pre-read of every game we're about to touch ---------------
  const universeIds = inputs.map((i) => i.game.universeId);
  const existingByUniverse = new Map<bigint, ExistingGameRef>();
  for (const ids of chunk(universeIds, IN_CHUNK)) {
    const rows = await prisma.game.findMany({
      where: { universeId: { in: ids } },
      select: {
        id: true,
        universeId: true,
        allTimePeakPlayers: true,
        currentGenreId: true,
        robloxUpdatedAt: true,
      },
    });
    for (const r of rows) {
      existingByUniverse.set(r.universeId, {
        id: r.id,
        allTimePeakPlayers: r.allTimePeakPlayers,
        currentGenreId: r.currentGenreId,
        robloxUpdatedAt: r.robloxUpdatedAt,
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

  // --- Phase 2a: record update events for existing games ---------------------
  // Before the Game rows are overwritten: if the run dies in between, the next
  // run still sees the old timestamp and records the event then.
  const updateEvents: Prisma.GameUpdateCreateManyInput[] = [];
  for (const input of inputs) {
    const existing = existingByUniverse.get(input.game.universeId);
    if (!existing || !planGameWrite(input, existing).newUpdate) continue;
    updateEvents.push({
      gameId: existing.id,
      updatedAt: input.game.robloxUpdatedAt,
      previousUpdatedAt: existing.robloxUpdatedAt,
      detectedAt: input.collectedAt,
    });
  }
  let updatesRecorded = await recordGameUpdates(updateEvents, writes);

  // --- Phase 2b: write the games (createMany for new, batched updates for old) --
  for (const group of chunk(creates, CREATE_CHUNK)) {
    const { count } = await prisma.game.createMany({ data: group });
    addWrites(writes, "Game", { inserted: count });
  }
  for (const batch of chunk(updates, TX_BATCH)) {
    await prisma.$transaction(
      batch.map((u) =>
        prisma.game.update({ where: { id: u.id }, data: u.data, select: { id: true } }),
      ),
    );
    addWrites(writes, "Game", { updated: batch.length });
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

  // New games' first timestamp starts their update history.
  updatesRecorded += await recordGameUpdates(
    creates.map((c) => ({
      gameId: idByUniverse.get(c.universeId as bigint)!,
      updatedAt: c.robloxUpdatedAt as Date,
      previousUpdatedAt: null,
      detectedAt: c.firstSeenAt as Date,
    })),
    writes,
  );

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
    const { count } = await prisma.gameSnapshot.createMany({ data: group });
    addWrites(writes, "GameSnapshot", { inserted: count });
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
      const { count } = await prisma.gameGenreHistory.updateMany({
        where: { gameId: { in: ids }, endedAt: null },
        data: { endedAt: closedAt },
      });
      addWrites(writes, "GameGenreHistory", { updated: count });
    }
  }
  for (const group of chunk(genreOpens, CREATE_CHUNK)) {
    const { count } = await prisma.gameGenreHistory.createMany({ data: group });
    addWrites(writes, "GameGenreHistory", { inserted: count });
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
    const { count } = await prisma.gameTheme.createMany({ data: group });
    addWrites(writes, "GameTheme", { inserted: count });
  }
  for (const batch of chunk(themeRemovals, TX_BATCH)) {
    const results = await prisma.$transaction(
      batch.map((r) =>
        prisma.gameTheme.deleteMany({ where: { gameId: r.gameId, themeId: { in: r.themeIds } } }),
      ),
    );
    addWrites(writes, "GameTheme", { deleted: results.reduce((n, r) => n + r.count, 0) });
  }

  return {
    persisted: inputs.length,
    newGames,
    peaksUpdated,
    genreChanges,
    updatesRecorded,
    writes,
  };
}

/**
 * Insert GameUpdate events, skipping any already stored (a re-run after a
 * crash between this and the Game update). SQLite's createMany has no
 * skipDuplicates, so the few candidate rows are checked with one read first.
 */
async function recordGameUpdates(
  events: Prisma.GameUpdateCreateManyInput[],
  writes: WriteCounts,
): Promise<number> {
  const valid = events.filter((e) => !Number.isNaN((e.updatedAt as Date).getTime()));
  if (valid.length === 0) return 0;
  // Read by a flat `gameId IN (...)` and match the exact pairs here. An `OR` of
  // (gameId, updatedAt) pairs nests one level per term in SQLite's expression
  // tree and fails past depth 100 ("Expression tree is too large"), which broke
  // every collect run with more than ~100 updated games. A game has only a
  // handful of stored updates, so the extra rows read are negligible.
  const stored = new Set<string>();
  const gameIds = [...new Set(valid.map((e) => e.gameId))];
  for (const ids of chunk(gameIds, IN_CHUNK)) {
    const rows = await prisma.gameUpdate.findMany({
      where: { gameId: { in: ids } },
      select: { gameId: true, updatedAt: true },
    });
    for (const r of rows) stored.add(`${r.gameId}|${r.updatedAt.getTime()}`);
  }
  const fresh = valid.filter((e) => !stored.has(`${e.gameId}|${(e.updatedAt as Date).getTime()}`));
  let inserted = 0;
  for (const group of chunk(fresh, CREATE_CHUNK)) {
    const { count } = await prisma.gameUpdate.createMany({ data: group });
    inserted += count;
  }
  addWrites(writes, "GameUpdate", { inserted });
  return inserted;
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
 * perpetually starved.
 *
 * Split by collection cadence (Task #46): `due` games are collected this run;
 * `deferred` are low-activity games collected within the last day, which wait
 * for their next daily slot (still followed, just less often). With
 * `ignoreCadence`, every known game is due. With `busyOnly` (the write-budget
 * guard, Task #47), every low-activity game is deferred, due or not. */
export async function getKnownGamesForCollection(
  now: Date,
  opts: { ignoreCadence?: boolean; busyOnly?: boolean } = {},
): Promise<{ due: bigint[]; deferred: Set<bigint> }> {
  const rows = await prisma.game.findMany({
    select: { universeId: true, currentPlaying: true, firstSeenAt: true, lastCollectedAt: true },
    orderBy: { lastCollectedAt: "asc" },
  });
  const due: bigint[] = [];
  const deferred = new Set<bigint>();
  for (const r of rows) {
    if (opts.busyOnly && collectionTier(r, now) === "low") deferred.add(r.universeId);
    else if (opts.ignoreCadence || isDueForCollection(r, now)) due.push(r.universeId);
    else deferred.add(r.universeId);
  }
  return { due, deferred };
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

/** Sorts on an indexed Game column (see the @@index list in schema.prisma). */
export type ColumnSortField =
  "currentPlaying" | "currentVisits" | "currentFavorites" | "allTimePeakPlayers" | "firstSeenAt";

/** Column sorts plus computed ones ranked in memory (Tasks #70, #82). */
export type GameSortField = ColumnSortField | "likeRatio" | "growth" | "session";

export interface GamesListParams {
  genreSlug?: string;
  themeSlug?: string;
  status?: string;
  search?: string;
  /** Minimum current players. */
  minPlaying?: number;
  /** Bounds on the Roblox creation date. */
  created?: { gte?: Date; lt?: Date };
  sort?: GameSortField;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** growthPct by game id; required for sort "growth" (see getGameWindowGrowth). */
  growthById?: Map<string, number>;
  /** Est. session minutes by game id; required for sort "session" (see getSessionById). */
  sessionById?: Map<string, number>;
}

const LIST_INCLUDE = {
  currentGenre: true,
  passCatalog: { select: { forSaleCount: true, totalRobux: true } },
} as const;

/** The core games-list query — reads denormalized current metrics only, no
 * per-row snapshot join. */
export async function getGamesList(params: GamesListParams = {}) {
  const {
    genreSlug,
    themeSlug,
    status,
    search,
    minPlaying,
    created,
    sort = "currentPlaying",
    order = "desc",
    limit = 50,
    offset = 0,
  } = params;
  // Pages ask for 25; exports (Task #71) for up to 1,000.
  const take = Math.min(limit, 1000);

  const where: Prisma.GameWhereInput = {
    ...(genreSlug ? { currentGenre: { slug: genreSlug } } : {}),
    ...(themeSlug ? { themes: { some: { theme: { slug: themeSlug } } } } : {}),
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search } } : {}),
    ...(minPlaying ? { currentPlaying: { gte: minPlaying } } : {}),
    ...(created ? { robloxCreatedAt: created } : {}),
  };

  if (sort !== "likeRatio" && sort !== "growth" && sort !== "session") {
    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: { [sort]: order },
        take,
        skip: offset,
        include: LIST_INCLUDE,
      }),
      prisma.game.count({ where }),
    ]);
    return { games, total };
  }

  // Computed sorts: rank the matching games in memory, then load one page.
  const rows = await prisma.game.findMany({
    where,
    select: { id: true, currentUpVotes: true, currentDownVotes: true, currentPlaying: true },
  });
  const ranked =
    sort === "likeRatio"
      ? rankByLikeRatio(rows, order)
      : sort === "growth"
        ? rankByGrowth(rows, params.growthById ?? new Map(), order)
        : rankBySession(rows, params.sessionById ?? new Map(), order);
  const pageIds = ranked.slice(offset, offset + take);
  const byId = new Map(
    (await prisma.game.findMany({ where: { id: { in: pageIds } }, include: LIST_INCLUDE })).map(
      (g) => [g.id, g],
    ),
  );
  return {
    games: pageIds.flatMap((id) => byId.get(id) ?? []),
    total: ranked.length,
  };
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

/**
 * The most-played games' universe ids, busiest first (Task #96). One indexed
 * read of `limit` rows on currentPlaying.
 */
export async function getTopUniverseIds(limit: number): Promise<bigint[]> {
  const rows = await prisma.game.findMany({
    orderBy: { currentPlaying: "desc" },
    take: limit,
    select: { universeId: true },
  });
  return rows.map((r) => r.universeId);
}

/** The most-played games right now, for the dashboard (Task #105). */
export function getTopGamesNow(limit: number) {
  return prisma.game.findMany({
    orderBy: { currentPlaying: "desc" },
    take: limit,
    select: {
      id: true,
      universeId: true,
      name: true,
      currentPlaying: true,
      currentGenre: { select: { slug: true, name: true } },
    },
  });
}

/** The latest `n` snapshots of one game, oldest-first. */
export async function getLatestSnapshots(gameId: string, n: number) {
  const rows = await prisma.gameSnapshot.findMany({
    where: { gameId },
    orderBy: { collectedAt: "desc" },
    take: n,
  });
  return rows.reverse();
}

/**
 * The earliest or latest snapshot time across all games, or null when there are
 * none. One row off the collectedAt index. Don't use `prisma.gameSnapshot
 * .aggregate({ _min/_max })` for this: Prisma wraps aggregates in a subquery,
 * which stops SQLite using the index, so it reads every snapshot (1.2M rows
 * per call on Turso, which was most of the monthly rows-read quota).
 */
export async function getSnapshotTimeBound(which: "first" | "last"): Promise<Date | null> {
  const row = await prisma.gameSnapshot.findFirst({
    orderBy: { collectedAt: which === "first" ? "asc" : "desc" },
    select: { collectedAt: true },
  });
  return row?.collectedAt ?? null;
}

/** universeId (as a string, for links) by internal game id. Unknown ids are left out. */
export async function getUniverseIds(gameIds: string[]): Promise<Record<string, string>> {
  if (gameIds.length === 0) return {};
  const rows = await prisma.game.findMany({
    where: { id: { in: gameIds } },
    select: { id: true, universeId: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.universeId.toString()]));
}

/** Candidates scanned per similar-games lookup before ranking in memory. */
const SIMILAR_CANDIDATES = 60;

/**
 * "Similar games" for the game page (Task #62): active games in the same genre
 * within a CCU band, ranked by shared themes then CCU closeness. One indexed
 * read (currentGenreId); games without a genre get none rather than a guess.
 */
export async function getSimilarGames(
  game: { id: string; currentGenreId: string | null; currentPlaying: number; themeIds: string[] },
  limit = 6,
) {
  if (!game.currentGenreId) return [];
  const band = similarCcuBand(game.currentPlaying);
  const rows = await prisma.game.findMany({
    where: {
      currentGenreId: game.currentGenreId,
      status: "active",
      id: { not: game.id },
      currentPlaying: { gte: band.min, lte: band.max },
    },
    orderBy: { currentPlaying: "desc" },
    take: SIMILAR_CANDIDATES,
    select: {
      id: true,
      universeId: true,
      name: true,
      currentPlaying: true,
      themes: { select: { themeId: true } },
    },
  });
  return rankSimilarGames(
    { currentPlaying: game.currentPlaying, themeIds: game.themeIds },
    rows.map(({ themes, ...r }) => ({ ...r, themeIds: themes.map((t) => t.themeId) })),
    limit,
  );
}

/** Most recent updates measured on the game page. */
const UPDATES_SHOWN = 10;

/**
 * A game's recent recorded updates (Task #63) plus the snapshots around them,
 * for measuring before/after players on read. Two indexed reads: the updates by
 * the (gameId, updatedAt) key, then one snapshot range spanning their windows.
 */
export async function getGameUpdateHistory(gameId: string) {
  const [rows, total] = await Promise.all([
    prisma.gameUpdate.findMany({
      where: { gameId },
      orderBy: { updatedAt: "desc" },
      take: UPDATES_SHOWN,
      select: { updatedAt: true },
    }),
    prisma.gameUpdate.count({ where: { gameId } }),
  ]);
  const updates = rows.map((r) => r.updatedAt);
  const range = impactSnapshotRange(updates);
  const snapshots = range
    ? await prisma.gameSnapshot.findMany({
        where: { gameId, collectedAt: { gte: range.from, lte: range.to } },
        orderBy: { collectedAt: "asc" },
        select: { collectedAt: true, playing: true },
      })
    : [];
  return { updates, total, snapshots };
}
