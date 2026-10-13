import Link from "next/link";
import { cacheLife } from "next/cache";
import { ArrowRight } from "lucide-react";

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

import { GrowthBadge } from "@/components/data-table/growth-badge";
import { StatTile } from "@/components/data-table/stat-tile";
import { LocalTime } from "@/components/local-time";
import { AnimatedNumber } from "@/components/animated-number";
import { EmptyState } from "@/components/empty-state";
import { GameIcon } from "@/components/game-icon";
import { GenreDot } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";
import { Rank } from "@/components/rank";
import { SectionHeading } from "@/components/section-heading";
import { ShareBar } from "@/components/share-bar";
import { Sparkline } from "@/components/sparkline";

const DAY_MS = 86_400_000;
/** Rows on the players chart and on the genre chart beside it. */
const CHART_ROWS = 10;
const GENRE_ROWS = 8;

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
    getTopGamesNow(CHART_ROWS),
    getTopNewOnRoblox(new Date(now.getTime() - NEW_RELEASE_DAYS * DAY_MS), 4),
    countGames(),
    getLastCollectedAt(),
    getCorrelation(),
  ]);

  const classifiedGenres = genreStats.filter((g) => g.genreId && g.gameCount > 0);
  const topGenres = classifiedGenres.slice(0, GENRE_ROWS);
  // Every tracked game, classified or not: the headline number.
  const trackedPlaying = genreStats.reduce((sum, g) => sum + g.totalPlaying, 0);
  const classifiedPlaying = classifiedGenres.reduce((sum, g) => sum + g.totalPlaying, 0);

  // Thumbnails and sparklines for just the games and genres shown here. The
  // genre chart shows shares, not lines, so only the rising genres need one.
  const [icons, gameSparks, genreSparks] = await Promise.all([
    getSmallIcons([...risingGames, ...topGames, ...newGames].map((g) => g.universeId)),
    getGameSparklines([...new Set([...risingGames, ...topGames].map((g) => g.id))]),
    getGenreSparklines(risingGenres.map((g) => g.id)),
  ]);
  const iconOf = (universeId: bigint) => icons.get(String(universeId)) ?? null;

  return {
    trackedPlaying,
    topGenres: topGenres.map((g) => ({
      ...g,
      share: trackedPlaying > 0 ? g.totalPlaying / trackedPlaying : 0,
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

/** First day → last day of a sparkline, when both ends were collected. */
function sparkChange(values: (number | null)[]): number | null {
  const first = values[0];
  const last = values.at(-1);
  if (first == null || last == null || first <= 0) return null;
  return (last - first) / first;
}

const MORE_LINK = "inline-flex items-center gap-1 hover:text-foreground hover:underline";
// The players chart and the rising list share one set of columns.
const CHART_GRID =
  "grid grid-cols-[2rem_2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[3.25rem_2.5rem_minmax(0,1fr)_6rem_4.75rem_5rem] sm:gap-x-3.5";

function ChartHead({ figure }: { figure: string }) {
  return (
    <div
      aria-hidden="true"
      className={`${CHART_GRID} border-b-2 border-rule pb-1.5 text-[13px] text-muted-foreground`}
    >
      <span className="text-right">Pos.</span>
      <span />
      <span>Game</span>
      <span className="text-right">{figure}</span>
      <span className="hidden text-right sm:block">Last {SPARK_DAYS}d</span>
      <span className="hidden sm:block" />
    </div>
  );
}

function ChartRow({
  position,
  href,
  icon,
  name,
  genre,
  figure,
  figureLabel,
  change,
  spark,
}: {
  position: number;
  href: string;
  icon: string | null;
  name: string;
  genre: { slug: string | null; name: string } | null;
  figure: string;
  figureLabel: string;
  change: number | null;
  spark: (number | null)[];
}) {
  return (
    <li className="border-b">
      <Link href={href} className={`${CHART_GRID} group py-2.5 hover:bg-muted/60 sm:py-2`}>
        <Rank value={position} className="text-3xl sm:text-[3.25rem]" />
        <GameIcon src={icon} size={40} className="size-9 sm:size-10" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-base font-bold group-hover:underline sm:text-[17px]">
            {name}
          </span>
          {genre && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <GenreDot genre={genre.slug ?? genre.name} className="size-2" />
              <span className="truncate">{genre.name}</span>
            </span>
          )}
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-xl font-figure">
            {figure}
            <span className="sr-only"> {figureLabel}</span>
          </span>
          <span className="text-xs sm:hidden">
            <GrowthBadge growth={change} />
          </span>
        </span>
        <span className="hidden text-right text-sm sm:block">
          <GrowthBadge growth={change} />
        </span>
        <Sparkline values={spark} width={80} className="hidden justify-self-end sm:inline-block" />
      </Link>
    </li>
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

  return (
    <div className="flex flex-1 flex-col gap-10 p-6">
      <PageHeader
        title="The players chart"
        description={
          <>
            {`${totalGames.toLocaleString("en-US")} tracked games ranked by players at the last collection`}
            {lastCollectedAt && (
              <>
                , <LocalTime value={lastCollectedAt} />
              </>
            )}
            . A sample, not all of Roblox.
          </>
        }
      />

      {totalGames === 0 ? (
        <EmptyState
          title="No data yet"
          hint="The collector hasn't run. The chart fills in after its first collection."
        />
      ) : (
        <>
          <div className="grid gap-x-11 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section aria-label="Most played games" className="min-w-0">
              <ChartHead figure="Players" />
              <ol>
                {topGames.map((g, i) => (
                  <ChartRow
                    key={g.id}
                    position={i + 1}
                    href={`/games/${g.universeId}`}
                    icon={g.icon}
                    name={g.name}
                    genre={g.currentGenre}
                    figure={formatCompact(g.currentPlaying)}
                    figureLabel="players"
                    change={sparkChange(g.spark)}
                    spark={g.spark}
                  />
                ))}
              </ol>
              <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                <span>
                  {`Last ${SPARK_DAYS}d compares the daily average on the first and last day of the line.`}
                </span>
                <Link href="/games?view=table" className={`${MORE_LINK} text-link`}>
                  {`All ${totalGames.toLocaleString("en-US")} games`}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </p>
            </section>

            <aside className="flex min-w-0 flex-col gap-8">
              <section className="flex flex-col">
                <SectionHeading
                  aside={
                    <Link href="/genres" className={MORE_LINK}>
                      {`All ${classifiedGenreCount}`}
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  }
                >
                  Genre chart
                </SectionHeading>
                {topGenres.length === 0 ? (
                  <EmptyState title="No classified genres yet" className="border-t-0" />
                ) : (
                  <ol>
                    {topGenres.map((g, i) => (
                      <li key={g.genreId ?? i} className="border-b">
                        <Link
                          href={`/genres/${g.slug}`}
                          className="group grid grid-cols-[1.75rem_0.75rem_minmax(0,1fr)_auto_2.75rem] items-center gap-x-2.5 py-1.5 hover:bg-muted/60"
                        >
                          <Rank value={i + 1} size="sm" />
                          <GenreDot genre={g.slug} className="size-3" />
                          <span className="truncate font-bold group-hover:underline">{g.name}</span>
                          <span className="text-right">
                            {formatCompact(g.totalPlaying)}
                            <span className="sr-only"> players</span>
                          </span>
                          <span className="text-right text-[13px] text-muted-foreground">
                            {`${Math.round(g.share * 100)}%`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Players now, and each genre&apos;s share of all tracked players.
                </p>
              </section>

              <section className="flex flex-col gap-4">
                <SectionHeading
                  aside={
                    <Link href="/market" className={MORE_LINK}>
                      Over time
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  }
                >
                  All tracked
                </SectionHeading>
                <div className="flex flex-col gap-1">
                  <AnimatedNumber
                    value={trackedPlaying}
                    className="text-[clamp(2.75rem,9vw,3.75rem)] font-figure"
                  />
                  <span className="text-sm text-muted-foreground">
                    players in tracked games at the last collection
                  </span>
                </div>
                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-5">
                  <StatTile label="Genres active" value={formatCompact(classifiedGenreCount)} />
                  <StatTile
                    label="Est. earnings/day"
                    help="earnings"
                    value={
                      <span className="text-xl whitespace-nowrap">
                        {formatUsdRange(totalEarnings.low, totalEarnings.high)}
                      </span>
                    }
                    badge="Est."
                  />
                </div>
              </section>
            </aside>
          </div>

          <div className="grid gap-x-11 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="flex min-w-0 flex-col">
              <SectionHeading
                className="mb-3"
                aside={
                  <Link href="/trending?range=7d" className={MORE_LINK}>
                    All trending
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                }
              >
                Rising this week
              </SectionHeading>
              {risingGames.length === 0 ? (
                <EmptyState
                  className="border-t-0"
                  title="Nothing has risen this week yet"
                  hint="Either no game grew, or there isn't a week of history to compare. This fills in as collection continues."
                />
              ) : (
                <>
                  <ChartHead figure="Avg players" />
                  <ol>
                    {risingGames.map((g, i) => (
                      <ChartRow
                        key={g.id}
                        position={i + 1}
                        href={`/games/${g.universeId}`}
                        icon={g.icon}
                        name={g.name}
                        genre={g.genreName ? { slug: null, name: g.genreName } : null}
                        figure={formatCompact(Math.round(g.currentPlaying))}
                        figureLabel="average players"
                        change={g.growthPct}
                        spark={g.spark}
                      />
                    ))}
                  </ol>
                  <p className="mt-3 max-w-[75ch] text-[13px] text-muted-foreground">
                    {`Ranked by growth in average players from the first day of the week to the last. Only games averaging at least ${RISING.minBaseline} players at the start are ranked.`}
                  </p>
                </>
              )}
            </section>

            <aside className="flex min-w-0 flex-col gap-8">
              {risingGenres.length > 0 && (
                <section className="flex flex-col">
                  <SectionHeading>Rising genres</SectionHeading>
                  <ul>
                    {risingGenres.map((g) => (
                      <li key={g.id} className="border-b">
                        <Link
                          href={`/genres/${g.slug}`}
                          className="group grid grid-cols-[0.75rem_minmax(0,1fr)_auto_5.25rem] items-center gap-x-2.5 py-2 hover:bg-muted/60"
                        >
                          <GenreDot genre={g.slug} className="size-3" />
                          <span className="truncate font-bold group-hover:underline">{g.name}</span>
                          <Sparkline values={g.spark} width={56} height={20} />
                          <span className="text-right text-sm">
                            <GrowthBadge growth={g.growthPct} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="flex flex-col">
                <SectionHeading
                  aside={
                    <Link href="/new" className={MORE_LINK}>
                      All new
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  }
                >
                  New on Roblox
                </SectionHeading>
                {newGames.length === 0 ? (
                  <EmptyState
                    className="border-t-0"
                    tone="plain"
                    title={`No tracked game was created in the last ${NEW_RELEASE_DAYS} days`}
                  />
                ) : (
                  <ul>
                    {newGames.map((g) => (
                      <li key={g.id} className="border-b">
                        <Link
                          href={`/games/${g.universeId}`}
                          className="group flex items-center gap-3 py-2 hover:bg-muted/60"
                        >
                          <GameIcon src={g.icon} size={36} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-bold group-hover:underline">
                              {g.name}
                            </span>
                            {g.robloxCreatedAt && (
                              <span className="text-[13px] text-muted-foreground">
                                Created{" "}
                                <LocalTime
                                  value={g.robloxCreatedAt}
                                  options={{ dateStyle: "medium" }}
                                />
                              </span>
                            )}
                          </span>
                          <span className="text-right">
                            {formatCompact(g.currentPlaying)}
                            <span className="sr-only"> players</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>

          {correlation && correlation.status === "ok" && (
            <section className="flex flex-col gap-3">
              <SectionHeading aside={`n = ${correlation.n.toLocaleString("en-US")} games`}>
                What goes with more players
              </SectionHeading>
              <p className="max-w-[75ch] text-sm text-muted-foreground">
                How each stat lines up with a game&apos;s current player count. Correlation says
                whether a stat rises with player count; importance says how much a model leans on it
                to predict player count, including non-linear effects. Neither says a stat causes
                more players.
              </p>
              <div className="grid gap-x-11 gap-y-6 lg:grid-cols-2">
                <div className="flex flex-col">
                  <h3 className="border-b pb-1.5 text-[13px] text-muted-foreground">
                    Rank correlation, −1 to +1
                  </h3>
                  {correlation.correlations.map((c) => (
                    <div key={c.feature} className="flex items-center gap-3 border-b py-2">
                      <span className="w-32 shrink-0 text-sm font-semibold">{c.label}</span>
                      <ShareBar
                        value={Math.abs(c.spearman)}
                        tone={c.spearman >= 0 ? "up" : "down"}
                      />
                      <span className="w-14 shrink-0 text-right text-sm">
                        {c.spearman >= 0 ? "+" : "−"}
                        {Math.abs(c.spearman).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                {correlation.importances.length > 0 && (
                  <div className="flex flex-col">
                    <h3 className="border-b pb-1.5 text-[13px] text-muted-foreground">
                      Importance in a random-forest model, shares sum to 100%
                    </h3>
                    {correlation.importances.map((imp) => (
                      <div key={imp.feature} className="flex items-center gap-3 border-b py-2">
                        <span className="w-32 shrink-0 text-sm font-semibold">{imp.label}</span>
                        <ShareBar value={imp.importance} />
                        <span className="w-14 shrink-0 text-right text-sm">
                          {Math.round(imp.importance * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {correlation.note && (
                <p className="max-w-[75ch] text-xs text-muted-foreground">{correlation.note}</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
