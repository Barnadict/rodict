import Link from "next/link";
import { cacheLife } from "next/cache";
import { TrendingUp, ArrowRight } from "lucide-react";

import { getGenreStats } from "@/lib/db/genre-stats";
import { RISING, getRisingGames, getRisingGenres } from "@/lib/db/trends";
import { getLastCollectedAt, countGames } from "@/lib/db/games";
import { getCorrelation } from "@/lib/db/analytics";
import { rangeToCutoff } from "@/lib/date-range";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { StatTile } from "@/components/data-table/stat-tile";
import { LocalTime } from "@/components/local-time";

/**
 * Cached: the collector only writes every 3h, so re-querying on every request
 * bought nothing but latency and DB reads. `lastCollectedAt` is cached with the
 * rest on purpose — it describes the snapshot being displayed, so it stays
 * truthful about this payload. (The footer's indicator is separate and live: it
 * answers "is the pipeline healthy?", not "how old is this table?".)
 */
async function getDashboardData() {
  // Remote (Task #98): few distinct keys, so a cold instance reuses another's entry.
  "use cache: remote";
  cacheLife("hours");

  const cutoff = rangeToCutoff("7d");

  const [genreStats, risingGames, risingGenres, totalGames, lastCollectedAt, correlation] =
    await Promise.all([
      getGenreStats({ sort: "totalPlaying", order: "desc" }),
      getRisingGames({ cutoff, limit: 5 }),
      getRisingGenres({ cutoff, limit: 3 }),
      countGames(),
      getLastCollectedAt(),
      getCorrelation(),
    ]);

  const classifiedGenres = genreStats.filter((g) => g.genreId && g.gameCount > 0);
  const totalPlaying = classifiedGenres.reduce((sum, g) => sum + g.totalPlaying, 0);

  return {
    topGenres: classifiedGenres.slice(0, 5),
    risingGames,
    risingGenres,
    totalGames,
    lastCollectedAt,
    correlation,
    classifiedGenreCount: classifiedGenres.length,
    // Priced at the collection date's DevEx rate rather than "now" — the rate
    // that applied when these players were counted is the right one.
    totalEarnings: estimateDailyEarningsFromCcu(totalPlaying, lastCollectedAt ?? new Date()),
  };
}

export default async function Home() {
  const {
    topGenres,
    risingGames,
    risingGenres,
    totalGames,
    lastCollectedAt,
    correlation,
    classifiedGenreCount,
    totalEarnings,
  } = await getDashboardData();

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
            <StatTile label="Genres active" value={formatCompact(classifiedGenreCount)} />
            <StatTile
              label="Est. earnings/day"
              value={formatUsdRange(totalEarnings.low, totalEarnings.high)}
              badge="Est."
            />
            <StatTile
              label="Last collected"
              value={lastCollectedAt ? <LocalTime value={lastCollectedAt} /> : "—"}
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
                    Nothing has grown this week yet, or there isn&apos;t enough history — this fills
                    in as the collector runs.
                  </p>
                )}
                {risingGames.map((g) => (
                  <Link
                    key={g.id}
                    href={`/games/${g.universeId}`}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate font-medium">{g.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatCompact(Math.round(g.basePlaying))} →{" "}
                        {formatCompact(Math.round(g.currentPlaying))}
                      </span>
                      <GrowthBadge growth={g.growthPct} />
                    </span>
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
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatCompact(Math.round(g.basePlaying))} →{" "}
                        {formatCompact(Math.round(g.currentPlaying))}
                      </span>
                      <GrowthBadge growth={g.growthPct} />
                    </span>
                  </Link>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Average players on the first day of the week → the last day. Only games averaging at
                least {RISING.minBaseline} players at the start are ranked.
              </p>
            </section>
          </div>

          {correlation && correlation.status === "ok" && (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="font-medium">What&apos;s associated with more players</h2>
                <p className="text-sm text-muted-foreground">
                  How each stat lines up with a game&apos;s current player count. Associational, not
                  causal · n={correlation.n}.
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="flex flex-col divide-y rounded-lg border">
                  <div className="p-3 text-sm text-muted-foreground">
                    Rank correlation (−1 to +1)
                  </div>
                  {correlation.correlations.map((c) => {
                    const pct = Math.min(100, Math.abs(c.spearman) * 100);
                    const positive = c.spearman >= 0;
                    return (
                      <div key={c.feature} className="flex items-center gap-3 p-3">
                        <span className="w-32 shrink-0 text-sm font-medium">{c.label}</span>
                        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={positive ? "bg-emerald-500" : "bg-red-500"}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                          {c.spearman >= 0 ? "+" : "−"}
                          {Math.abs(c.spearman).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {correlation.importances.length > 0 && (
                  <div className="flex flex-col divide-y rounded-lg border">
                    <div className="p-3 text-sm text-muted-foreground">
                      Importance in a random-forest model (shares sum to 100%)
                    </div>
                    {correlation.importances.map((imp) => (
                      <div key={imp.feature} className="flex items-center gap-3 p-3">
                        <span className="w-32 shrink-0 text-sm font-medium">{imp.label}</span>
                        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="bg-primary"
                            style={{ width: `${Math.min(100, imp.importance * 100)}%` }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                          {Math.round(imp.importance * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Correlation says whether a stat rises with player count; importance says how much a
                model leans on it to predict player count, including non-linear effects. Neither
                says a stat causes more players.
              </p>
              {correlation.note && (
                <p className="text-xs text-muted-foreground">{correlation.note}</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
