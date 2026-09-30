import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export interface MarketRow {
  collectedAt: string;
  totalPlaying: number | bigint;
  totalGames: number | bigint;
  /** Classified games the slice's genre points stand for (games ÷ coverage). */
  classifiedGames: number | null;
  /** Genre points in the slice that lack a coverage value (pre-#52 rows). */
  missingCoverage: number | bigint;
}

export interface MarketPoint {
  /** ISO timestamp of the collection run. */
  date: string;
  totalPlaying: number;
  totalGames: number;
  /** Share (0–1) of classified games in this point; null before #52 recorded it. */
  coverage: number | null;
}

/** Grouped rows → chart points (pure, tested). SQLite returns text timestamps
 * and may return integer sums as bigint. */
export function toMarketPoints(rows: MarketRow[]): MarketPoint[] {
  return rows.map((r) => {
    const totalGames = Number(r.totalGames);
    const coverage =
      Number(r.missingCoverage) === 0 && r.classifiedGames && r.classifiedGames > 0
        ? Math.min(1, totalGames / r.classifiedGames)
        : null;
    return {
      date: new Date(r.collectedAt).toISOString(),
      totalPlaying: Number(r.totalPlaying),
      totalGames,
      coverage,
    };
  });
}

/**
 * Total players across every classified tracked game, one point per collection
 * run, oldest-first (Task #114). Sums GenreSnapshot rows, which the collector
 * already aggregated per run (Task #52), so this never scans GameSnapshot: it
 * reads ~one row per genre per run on the `collectedAt` index.
 */
export async function getMarketSeries(from?: Date): Promise<MarketPoint[]> {
  const where = from ? Prisma.sql`WHERE "collectedAt" >= ${from}` : Prisma.empty;
  const rows = await prisma.$queryRaw<MarketRow[]>`
    SELECT
      "collectedAt",
      SUM("totalPlaying") AS "totalPlaying",
      SUM("totalGames") AS "totalGames",
      SUM(CASE WHEN coverage > 0 THEN "totalGames" / coverage END) AS "classifiedGames",
      SUM(CASE WHEN coverage IS NULL OR coverage <= 0 THEN 1 ELSE 0 END) AS "missingCoverage"
    FROM "GenreSnapshot"
    ${where}
    GROUP BY "collectedAt"
    ORDER BY "collectedAt" ASC
  `;
  return toMarketPoints(rows);
}
