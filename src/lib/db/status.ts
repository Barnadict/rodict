import { prisma } from "@/lib/prisma";
import { COLLECTION_CADENCE, type CollectionTier } from "@/lib/collector/cadence";
import { effectiveRunStatus } from "@/lib/collector/run-health";
import { parseWritesTotal, type StatusRun } from "@/lib/status";

/**
 * Reads for the /status page (Task #73). Read-only. A week of JobRuns is under
 * 100 rows, and coverage is one aggregate over `Game` (~5K rows).
 */

/** Every JobRun started since `since`, newest first, with its write count. */
export async function getRunsSince(since: Date): Promise<StatusRun[]> {
  const rows = await prisma.jobRun.findMany({
    where: { startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      job: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      summary: true,
      error: true,
    },
  });
  // `effectiveRunStatus` (Task #75): a partial collect run that saved (almost)
  // nothing counts as a failure here, as it does in the footer.
  return rows.map(({ summary, ...r }) => ({
    ...r,
    status: effectiveRunStatus({ ...r, summary }),
    writesTotal: parseWritesTotal(summary),
  }));
}

export interface TierCoverage {
  tier: CollectionTier;
  total: number;
  within6h: number;
  within24h: number;
}

const HOUR_MS = 3_600_000;

/**
 * How many tracked games were collected in the last 6h and 24h, per cadence
 * tier. The tier is derived from `currentPlaying` and `firstSeenAt`, exactly
 * as `collectionTier` in cadence.ts does.
 */
export async function getCollectionCoverage(now: Date): Promise<TierCoverage[]> {
  const newSince = new Date(now.getTime() - COLLECTION_CADENCE.newGameDays * 24 * HOUR_MS);
  const since6h = new Date(now.getTime() - 6 * HOUR_MS);
  const since24h = new Date(now.getTime() - 24 * HOUR_MS);

  const rows = await prisma.$queryRaw<
    {
      tier: string;
      total: bigint | number;
      within6h: bigint | number;
      within24h: bigint | number;
    }[]
  >`
    SELECT
      CASE
        WHEN "currentPlaying" >= ${COLLECTION_CADENCE.busyMinPlaying} OR "firstSeenAt" > ${newSince}
        THEN 'busy' ELSE 'low'
      END AS "tier",
      COUNT(*) AS "total",
      COALESCE(SUM(CASE WHEN "lastCollectedAt" >= ${since6h} THEN 1 ELSE 0 END), 0) AS "within6h",
      COALESCE(SUM(CASE WHEN "lastCollectedAt" >= ${since24h} THEN 1 ELSE 0 END), 0) AS "within24h"
    FROM "Game"
    GROUP BY 1
  `;

  const byTier = new Map(rows.map((r) => [r.tier, r]));
  return (["busy", "low"] as const).map((tier) => {
    const r = byTier.get(tier);
    return {
      tier,
      total: Number(r?.total ?? 0),
      within6h: Number(r?.within6h ?? 0),
      within24h: Number(r?.within24h ?? 0),
    };
  });
}
