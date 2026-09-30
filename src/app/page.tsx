import Link from "next/link";
import { cacheLife } from "next/cache";
import { TrendingUp, ArrowRight, Sparkles, Activity } from "lucide-react";

import { getGenreStats } from "@/lib/db/genre-stats";
import { RISING, getRisingGames, getRisingGenres } from "@/lib/db/trends";
import { getLastCollectedAt, countGames, getTopGamesNow } from "@/lib/db/games";
import { getTopNewOnRoblox } from "@/lib/db/new-releases";
import { getCorrelation } from "@/lib/db/analytics";
import { getGameSparklines, getGenreSparklines } from "@/lib/db/sparklines";
import { getSmallIcons } from "@/lib/game-icons";
import { NEW_RELEASE_DAYS } from "@/lib/new-releases";
import { SPARK_DAYS } from "@/lib/sparkline";
import { rangeToCutoff } from "@/lib/date-range";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { StatTile } from "@/components/data-table/stat-tile";
import { LocalTime } from "@/components/local-time";
import { AnimatedNumber } from "@/components/animated-number";
import { GameIcon } from "@/components/game-icon";
import { GenreBadge, GenreDot } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";
import { Sparkline } from "@/components/sparkline";

const DAY_MS = 86_400_000;

/**
 * Cached: the collector only writes every 3h, so re-querying on every request
 * bought nothing but latency and DB reads. `lastCollectedAt` is cached with the
 * rest on purpose — it describes the snapshot being displayed, so it stays
 * truthful about this payload. (The footer's indicator is separate and live: it
 * answers "is the pipeline healthy?", not "how old is this table?".)
 *
 * The page has no params, so it stays a full static shell (Task #105): the
 * clock is read in here, and the only client code is the count-up number.
 */
async function getDashboardData() {
  // Remote (Task #98): few distinct keys, so a cold instance reuses another's entry.
  "use cache: remote";
  cacheLife("hours");

  const now = new Date();
  const cutoff = rangeToCutoff("7d");

  const [
    genreStats,
    risingGames,
    risingGenres,
    topGames,
    newGames,
    totalGames,
    lastCollectedAt,
    correlation,
  ] = await Promise.all([
    getGenreStats({ sort: "totalPlaying", order: "desc" }),
    getRisingGames({ cutoff, limit: 6 }),
    getRisingGenres({ cutoff, limit: 3 }),
    getTopGamesNow(5),
    getTopNewOnRoblox(new Date(now.getTime() - NEW_RELEASE_DAYS * DAY_MS), 4),
    countGames(),
    getLastCollectedAt(),
    getCorrelation(),
  ]);

  const classifiedGenres = genreStats.filter((g) => g.genreId && g.gameCount > 0);
  const topGenres = classifiedGenres.slice(0, 5);
  // Every tracked game, classified or not: the headline number.
  const trackedPlaying = genreStats.reduce((sum, g) => sum + g.totalPlaying, 0);
  const classifiedPlaying = classifiedGenres.reduce((sum, g) => sum + g.totalPlaying, 0);

  // Thumbnails and sparklines for just the games and genres shown here.
  const genreIds = [
    ...topGenres.flatMap((g) => (g.genreId ? [g.genreId] : [])),
    ...risingGenres.map((g) => g.id),
  ];
  const [icons, gameSparks, genreSparks] = await Promise.all([
    getSmallIcons([...risingGames, ...topGames, ...newGames].map((g) => g.universeId)),
    getGameSparklines([...new Set([...risingGames, ...topGames].map((g) => g.id))]),
    getGenreSparklines([...new Set(genreIds)]),
  ]);
  const iconOf = (universeId: bigint) => icons.get(String(universeId)) ?? null;

  return {
    trackedPlaying,
    topGenres: topGenres.map((g) => ({
      ...g,
      share: trackedPlaying > 0 ? g.totalPlaying / trackedPlaying : 0,
      spark: (g.genreId && genreSparks[g.genreId]) || [],
    })),
    topGames: topGames.map((g) => ({
      ...g,
      icon: iconOf(g.universeId),
      spark: gameSparks[g.id] ?? [],
    })),
    risingGames: risingGames.map((g) => ({
      ...g,
      icon: iconOf(g.universeId),
      spark: gameSparks[g.id] ?? [],
    })),
    risingGenres: risingGenres.map((g) => ({ ...g, spark: genreSparks[g.id] ?? [] })),
    newGames: newGames.map((g) => ({ ...g, icon: iconOf(g.universeId) })),
    totalGames,
    lastCollectedAt,
    correlation,
    classifiedGenreCount: classifiedGenres.length,
    // Priced at the collection date's DevEx rate rather than "now" — the rate
    // that applied when these players were counted is the right one.
    totalEarnings: estimateDailyEarningsFromCcu(classifiedPlaying, lastCollectedAt ?? new Date()),
  };
}

function SectionHeading({
  icon,
  title,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="inline-flex items-center gap-1.5 text-lg font-semibold tracking-tight">
        {icon}
        {title}
      </h2>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        {linkLabel} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

export default async function Home() {
  const {
    trackedPlaying,
    topGenres,
    topGames,
    risingGames,
    risingGenres,
    newGames,
    totalGames,
    lastCollectedAt,
    correlation,
    classifiedGenreCount,
    totalEarnings,
  } = await getDashboardData();

  const hasAnyData = totalGames > 0;

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <PageHeader
        title="Dashboard"
        description="What's being played now, what's rising, and what's new across everything rodict tracks."
      />

      {!hasAnyData ? (
        <div className="flex min-h-64 flex-1 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          No data yet — the collector hasn&apos;t run.
        </div>
      ) : (
        <>
          <section
            aria-label="Players right now"
            className="flex flex-col gap-5 rounded-xl border bg-linear-to-br from-primary/10 via-transparent to-transparent p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Playing tracked games right now</span>
              <AnimatedNumber
                value={trackedPlaying}
                className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl"
              />
              <span className="text-sm text-muted-foreground">
                {`Across ${formatCompact(totalGames)} tracked games, not all of Roblox.`}{" "}
                {lastCollectedAt && (
                  <>
                    Collected <LocalTime value={lastCollectedAt} />.
                  </>
                )}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label="Games tracked" value={formatCompact(totalGames)} />
              <StatTile label="Genres active" value={formatCompact(classifiedGenreCount)} />
              <StatTile
                label="Est. earnings/day"
                help="earnings"
                value={formatUsdRange(totalEarnings.low, totalEarnings.high)}
                badge="Est."
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading
              icon={<Activity className="size-4.5" aria-hidden="true" />}
              title="Happening now"
              href="/genres"
              linkLabel="All genres"
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">Top genres</h3>
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
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-4 text-sm text-muted-foreground tabular-nums">
                          {i + 1}
                        </span>
                        <GenreDot genre={g.slug} />
                        <span className="truncate font-medium">{g.name}</span>
                        <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
                          {formatCompact(g.gameCount)} games
                        </Badge>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <Sparkline values={g.spark} width={64} className="hidden sm:inline-block" />
                        <span className="w-24 text-right text-sm tabular-nums">
                          {formatCompact(g.totalPlaying)}
                          <span className="text-xs text-muted-foreground">
                            {` · ${Math.round(g.share * 100)}%`}
                          </span>
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">Most played games</h3>
                <div className="flex flex-col divide-y rounded-lg border">
                  {topGames.map((g, i) => (
                    <Link
                      key={g.id}
                      href={`/games/${g.universeId}`}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="w-4 text-sm text-muted-foreground tabular-nums">
                          {i + 1}
                        </span>
                        <GameIcon src={g.icon} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{g.name}</span>
                          {g.currentGenre && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <GenreDot genre={g.currentGenre.slug} className="size-2" />
                              {g.currentGenre.name}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <Sparkline values={g.spark} width={64} className="hidden sm:inline-block" />
                        <span className="w-14 text-right text-sm tabular-nums">
                          {formatCompact(g.currentPlaying)}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading
              icon={<TrendingUp className="size-4.5" aria-hidden="true" />}
              title="Rising this week"
              href="/trending?range=7d"
              linkLabel="All trending"
            />
            {risingGames.length === 0 && risingGenres.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nothing has grown this week yet, or there isn&apos;t enough history — this fills in
                as the collector runs.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {risingGames.map((g) => (
                    <Link
                      key={g.id}
                      href={`/games/${g.universeId}`}
                      className="glow-primary-hover flex flex-col gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50"
                    >
                      <div className="flex items-start gap-3">
                        <GameIcon src={g.icon} size={48} />
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                          <span className="line-clamp-1 font-medium">{g.name}</span>
                          {g.genreName && <GenreBadge name={g.genreName} />}
                        </div>
                        <GrowthBadge growth={g.growthPct} />
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {`${formatCompact(Math.round(g.basePlaying))} → ${formatCompact(Math.round(g.currentPlaying))} avg players`}
                        </span>
                        <Sparkline values={g.spark} width={96} height={28} />
                      </div>
                    </Link>
                  ))}
                </div>
                {risingGenres.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {risingGenres.map((g) => (
                      <Link
                        key={g.id}
                        href={`/genres/${g.slug}`}
                        className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <GenreDot genre={g.slug} />
                        <span className="font-medium">{g.name}</span>
                        <Sparkline values={g.spark} width={48} height={20} />
                        <GrowthBadge growth={g.growthPct} />
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {`Average players on the first day of the week → the last day. Only games averaging at least ${RISING.minBaseline} players at the start are ranked. Lines show the last ${SPARK_DAYS} days' daily average.`}
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading
              icon={<Sparkles className="size-4.5" aria-hidden="true" />}
              title="New on Roblox"
              href="/new"
              linkLabel="All new releases"
            />
            {newGames.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {`No tracked game was created on Roblox in the last ${NEW_RELEASE_DAYS} days.`}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {newGames.map((g) => (
                  <Link
                    key={g.id}
                    href={`/games/${g.universeId}`}
                    className="glow-primary-hover flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50"
                  >
                    <GameIcon src={g.icon} size={40} />
                    <span className="flex min-w-0 flex-col">
                      <span className="line-clamp-1 text-sm font-medium">{g.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {`${formatCompact(g.currentPlaying)} playing`}
                      </span>
                      {g.robloxCreatedAt && (
                        <span className="text-xs text-muted-foreground">
                          Created{" "}
                          <LocalTime value={g.robloxCreatedAt} options={{ dateStyle: "medium" }} />
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

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
