import Link from "next/link";
import { TrendingUp, ArrowRight } from "lucide-react";

import { getGenreStats } from "@/lib/db/genre-stats";
import { getRisingGames, getRisingGenres } from "@/lib/db/trends";
import { getLastCollectedAt, countGames } from "@/lib/db/games";
import { rangeToCutoff } from "@/lib/date-range";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { StatTile } from "@/components/data-table/stat-tile";

// Reads live DB aggregates; no dynamic params to key a static render off.
export const dynamic = "force-dynamic";

export default async function Home() {
  const cutoff = rangeToCutoff("7d");

  const [genreStats, risingGames, risingGenres, totalGames, lastCollectedAt] = await Promise.all([
    getGenreStats({ sort: "totalPlaying", order: "desc" }),
    getRisingGames({ cutoff, limit: 5 }),
    getRisingGenres({ cutoff, limit: 3 }),
    countGames(),
    getLastCollectedAt(),
  ]);

  const classifiedGenres = genreStats.filter((g) => g.genreId && g.gameCount > 0);
  const topGenres = classifiedGenres.slice(0, 5);
  const totalPlaying = classifiedGenres.reduce((sum, g) => sum + g.totalPlaying, 0);
  const totalEarnings = estimateDailyEarningsFromCcu(totalPlaying);

  const hasAnyData = totalGames > 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Genre trends, rising games, and estimated earnings across everything tracked.
        </p>
      </div>

      {!hasAnyData ? (
        <div className="flex min-h-64 flex-1 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          No data yet — the collector hasn&apos;t run.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Games tracked" value={formatCompact(totalGames)} />
            <StatTile label="Genres active" value={formatCompact(classifiedGenres.length)} />
            <StatTile
              label="Est. earnings/day"
              value={formatUsdRange(totalEarnings.low, totalEarnings.high)}
              badge="Est."
            />
            <StatTile
              label="Last collected"
              value={
                lastCollectedAt
                  ? lastCollectedAt.toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Top genres</h2>
                <Link
                  href="/genres"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  All genres <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <div className="flex flex-col divide-y rounded-lg border">
                {topGenres.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">No classified genres yet.</p>
                )}
                {topGenres.map((g, i) => (
                  <Link
                    key={g.genreId ?? i}
                    href={`/genres/${g.slug}`}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="font-medium">{g.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {formatCompact(g.gameCount)} games
                      </Badge>
                    </span>
                    <span className="tabular-nums text-sm">
                      {formatCompact(g.totalPlaying)} players
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp className="size-4" /> Rising this week
                  </span>
                </h2>
                <Link
                  href="/trending"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  All trending <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <div className="flex flex-col divide-y rounded-lg border">
                {risingGames.length === 0 && risingGenres.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Not enough history yet to compute weekly movers — this fills in as the collector
                    runs.
                  </p>
                )}
                {risingGames.map((g) => (
                  <Link
                    key={g.id}
                    href={`/games/${g.universeId}`}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate font-medium">{g.name}</span>
                    <GrowthBadge growth={g.growthPct} />
                  </Link>
                ))}
                {risingGenres.map((g) => (
                  <Link
                    key={g.id}
                    href={`/genres/${g.slug}`}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate">
                      {g.name}{" "}
                      <Badge variant="outline" className="text-[10px]">
                        genre
                      </Badge>
                    </span>
                    <GrowthBadge growth={g.growthPct} />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
