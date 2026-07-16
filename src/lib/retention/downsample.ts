/**
 * Applies the retention policy to stored GameSnapshots: computes the plan per
 * game (policy.ts) and deletes the snapshots that fall out of resolution.
 *
 * Only snapshots older than the hourly window are loaded (id + gameId +
 * collectedAt — a light projection), so recent hot data is never touched.
 */

import { prisma } from "@/lib/prisma";

import {
  DEFAULT_RETENTION_POLICY,
  planDownsample,
  type RetentionPolicy,
  type SnapshotRef,
} from "./policy";

const DAY_MS = 86_400_000;
const DELETE_CHUNK = 500;

export interface DownsampleResult {
  gamesProcessed: number;
  snapshotsScanned: number;
  snapshotsDeleted: number;
  durationMs: number;
}

export async function downsampleSnapshots(
  now: Date = new Date(),
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY,
): Promise<DownsampleResult> {
  const startedAt = Date.now();
  const hourlyCutoff = new Date(now.getTime() - policy.hourlyDays * DAY_MS);

  // Only snapshots past the hourly window are downsampling candidates.
  const rows = await prisma.gameSnapshot.findMany({
    where: { collectedAt: { lt: hourlyCutoff } },
    select: { id: true, gameId: true, collectedAt: true },
    orderBy: { collectedAt: "asc" },
  });

  // Group by game.
  const byGame = new Map<string, SnapshotRef[]>();
  for (const r of rows) {
    const list = byGame.get(r.gameId) ?? [];
    list.push({ id: r.id, collectedAt: r.collectedAt });
    byGame.set(r.gameId, list);
  }

  const toRemove: string[] = [];
  for (const snaps of byGame.values()) {
    const plan = planDownsample(snaps, now, policy);
    toRemove.push(...plan.remove);
  }

  let deleted = 0;
  for (let i = 0; i < toRemove.length; i += DELETE_CHUNK) {
    const chunk = toRemove.slice(i, i + DELETE_CHUNK);
    const res = await prisma.gameSnapshot.deleteMany({ where: { id: { in: chunk } } });
    deleted += res.count;
  }

  return {
    gamesProcessed: byGame.size,
    snapshotsScanned: rows.length,
    snapshotsDeleted: deleted,
    durationMs: Date.now() - startedAt,
  };
}
