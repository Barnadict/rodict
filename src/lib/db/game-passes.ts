import { prisma } from "@/lib/prisma";
import { addWrites, type WriteCounts } from "@/lib/db/write-counts";
import {
  parsePasses,
  passShardOf,
  planPassWrites,
  serializePasses,
  type PassCatalog,
  type StoredCatalogRef,
} from "@/lib/game-passes";

/**
 * Game-pass catalog reads/writes (Task #69). See src/lib/game-passes.ts for the
 * weekly-shard, write-only-on-change design.
 */

const IN_CHUNK = 400;
const TX_BATCH = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Active games in one daily shard. The shard is a function of the universe id,
 * which SQL can't take mod of cheaply across BigInt text, so this reads the id
 * columns of the active games (~5K small rows, once a day) and filters here.
 */
export async function getGamesInPassShard(
  shard: number,
): Promise<{ id: string; universeId: bigint }[]> {
  const rows = await prisma.game.findMany({
    where: { status: "active" },
    select: { id: true, universeId: true },
  });
  return rows.filter((r) => passShardOf(r.universeId) === shard);
}

export interface FetchedCatalog {
  gameId: string;
  catalog: PassCatalog;
}

export interface PassPersistSummary {
  inserted: number;
  updated: number;
  unchanged: number;
  deferred: number;
  writes: WriteCounts;
}

/**
 * Write the catalogs that are new or changed, at most `cap` rows. One pre-read
 * of the stored lists, chunked inserts, batched updates.
 */
export async function persistPassCatalogs(
  fetched: FetchedCatalog[],
  now: Date,
  cap: number,
): Promise<PassPersistSummary> {
  const stored = new Map<string, StoredCatalogRef>();
  for (const ids of chunk(
    fetched.map((f) => f.gameId),
    IN_CHUNK,
  )) {
    const rows = await prisma.gamePassCatalog.findMany({
      where: { gameId: { in: ids } },
      select: { gameId: true, passes: true },
    });
    for (const r of rows) stored.set(r.gameId, { passes: r.passes });
  }

  const plan = planPassWrites(fetched, stored, cap);
  const row = (f: FetchedCatalog) => ({
    passes: serializePasses(f.catalog.passes),
    forSaleCount: f.catalog.forSaleCount,
    totalRobux: f.catalog.totalRobux,
    changedAt: now,
  });

  let inserted = 0;
  for (const group of chunk(plan.inserts, 200)) {
    const { count } = await prisma.gamePassCatalog.createMany({
      data: group.map((f) => ({ gameId: f.gameId, ...row(f) })),
    });
    inserted += count;
  }
  for (const group of chunk(plan.updates, TX_BATCH)) {
    await prisma.$transaction(
      group.map((f) =>
        prisma.gamePassCatalog.update({ where: { gameId: f.gameId }, data: row(f) }),
      ),
    );
  }

  const writes: WriteCounts = {};
  addWrites(writes, "GamePassCatalog", { inserted, updated: plan.updates.length });
  return {
    inserted,
    updated: plan.updates.length,
    unchanged: plan.unchanged,
    deferred: plan.deferred,
    writes,
  };
}

/** A game's stored catalog for the game page, or null if not checked yet. */
export async function getGamePassCatalog(gameId: string) {
  const row = await prisma.gamePassCatalog.findUnique({ where: { gameId } });
  if (!row) return null;
  return {
    passes: parsePasses(row.passes),
    forSaleCount: row.forSaleCount,
    totalRobux: row.totalRobux,
    changedAt: row.changedAt,
  };
}
