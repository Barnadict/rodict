import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { Suspense, cache } from "react";

import { getGenreBySlug } from "@/lib/db/genres";
import { getGenreStatBySlug, getGenreLifecycle } from "@/lib/db/genre-stats";
import { GENRE_CARRY_MAX_AGE_HOURS, getGenreSnapshots } from "@/lib/db/genre-snapshots";
import { getGamesList, getUniverseIds } from "@/lib/db/games";
import { getGrowthForGames } from "@/lib/db/trends";
import {
  getSurvivalForGenre,
  getClusteringForGenre,
  getOpportunityForGenre,
  getMomentumForGenre,
  getCohortsForGenre,
  getSeasonalityForGenre,
  getForecastForGenre,
  getUpdateImpactForGenre,
  getLaunchBenchmarkForGenre,
  getConcentrationForGenre,
  getAnalyticsComputedAt,
} from "@/lib/db/analytics";
import { benchmarkBand } from "@/lib/launch-benchmark";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { getEngagement, getPassPricing, getUpdateCadence } from "@/lib/cached-queries";
import {
  concentrationLevel,
  concentrationRows,
  effectiveGames,
  hhiPoints,
  latestWithBaseline,
} from "@/lib/concentration";
import { PRICE_BUCKETS } from "@/lib/pass-pricing";
import { SERVER_SIZE } from "@/lib/server-size";
import { SESSION_ESTIMATE, formatSessionMinutes } from "@/lib/engagement";
import { formatCompact, formatUsdRange } from "@/lib/format";
import { LOW_COVERAGE, buildProjection, formatGrowthPct } from "@/lib/stats";
import { GENRES } from "@/lib/taxonomy/genres";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { genreColor } from "@/lib/genre-colors";
import { GenreDot } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";
import { LocalTime } from "@/components/local-time";
import { LifecycleChart } from "@/components/charts/lifecycle-chart";
import { DailyLinesChart } from "@/components/charts/daily-lines-chart";
import { SurvivalChart } from "@/components/charts/survival-chart";
import { SeasonalityHeatmap } from "@/components/charts/seasonality-heatmap";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { CohortTable } from "@/components/data-table/cohort-table";
import { StatTile } from "@/components/data-table/stat-tile";
import { SectionSkeleton } from "@/components/data-table/section-skeleton";
import { ExportLinks } from "@/components/data-table/export-links";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { CompareButton } from "@/components/compare/compare-button";
import { PresetLinks } from "@/components/filters/preset-links";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";
import { pageMetadata } from "@/lib/site";

import { getGenreShare } from "./share";

type SearchParams = PageProps<"/genres/[slug]">["searchParams"];

/** Every genre is built at deploy (Task #96); the list is the fixed taxonomy. */
export function generateStaticParams() {
  return GENRES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata(props: PageProps<"/genres/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const share = await getGenreShare(slug);
  if (!share) return { title: "Genre — rodict" };
  return pageMetadata({
    title: `${share.genre.name} — rodict`,
    description: share.description,
    path: `/genres/${slug}`,
  });
}

/*
 * The heaviest page on the site: 13+ queries. They used to sit behind one
 * cached loader, so every section waited for the slowest. Now the header needs
 * only the route param (and is prerendered, Task #96), and each section below
 * streams in behind its own <Suspense> (Task #97). Loaders return null rather
 * than calling notFound() so the navigation signal isn't thrown (and cached)
 * from inside the cache.
 */

/** Title, stat tiles and engagement: the part of the page built at deploy. */
async function getGenreHead(slug: string) {
  "use cache";
  cacheLife("hours");

  const [genre, stat, engagementIndex] = await Promise.all([
    getGenreBySlug(slug),
    getGenreStatBySlug(slug),
    getEngagement(),
  ]);
  if (!genre) return null;

  return {
    genre,
    stat,
    engagement: engagementIndex.genres.find((g) => g.genreId === genre.id) ?? null,
    serverSize: engagementIndex.serverSize[genre.id] ?? null,
    // Priced inside the cache so the entry doesn't depend on when it's read.
    earnings: stat ? estimateDailyEarningsFromCcu(stat.totalPlaying, new Date()) : null,
  };
}

/** The precomputed analytics rows (one small read each). */
async function getGenreAnalytics(genreId: string) {
  "use cache";
  cacheLife("hours");

  const [
    survival,
    clustering,
    opportunity,
    momentum,
    cohorts,
    seasonality,
    forecast,
    updateImpact,
    analyticsAt,
    launchBenchmark,
    concentration,
  ] = await Promise.all([
    getSurvivalForGenre(genreId),
    getClusteringForGenre(genreId),
    getOpportunityForGenre(genreId),
    getMomentumForGenre(genreId),
    getCohortsForGenre(genreId),
    getSeasonalityForGenre(genreId),
    getForecastForGenre(genreId),
    getUpdateImpactForGenre(genreId),
    getAnalyticsComputedAt(),
    getLaunchBenchmarkForGenre(genreId),
    getConcentrationForGenre(genreId),
  ]);

  // Top movers are stored by internal id; links need the universeId.
  const moverUniverseIds = await getUniverseIds((momentum?.topMovers ?? []).map((m) => m.gameId));

  return {
    survival,
    clustering,
    opportunity,
    momentum,
    cohorts,
    seasonality,
    forecast,
    updateImpact,
    analyticsAt,
    launchBenchmark,
    concentration,
    moverUniverseIds,
  };
}

async function getGenreLifecycleCached(genreId: string) {
  "use cache";
  cacheLife("hours");
  return getGenreLifecycle(genreId);
}

async function getGenreSeries(genreId: string, range: RangeKey) {
  "use cache";
  cacheLife("hours");
  return getGenreSnapshots(genreId, { from: rangeToCutoff(range) });
}

/**
 * Top 10 games. A range narrower than "all" adds a Δ column, scoped to just
 * these 10 rows (Task #19) — same pattern as the games list.
 */
async function getGenreTopGames(slug: string, range: RangeKey) {
  "use cache";
  cacheLife("hours");

  const cutoff = rangeToCutoff(range);
  const topGames = await getGamesList({
    genreSlug: slug,
    sort: "currentPlaying",
    order: "desc",
    limit: 10,
  });
  const growthByGame = cutoff
    ? await getGrowthForGames(
        topGames.games.map((g) => g.id),
        cutoff,
      )
    : null;
  return { topGames, growthByGame };
}

/** One analytics load per request, shared by the sections that use it. */
const loadAnalytics = cache(getGenreAnalytics);

async function readRange(searchParams: SearchParams) {
  const sp = await searchParams;
  return parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);
}

type GenreHead = NonNullable<Awaited<ReturnType<typeof getGenreHead>>>;

export default async function GenreDetailPage(props: PageProps<"/genres/[slug]">) {
  const { slug } = await props.params;
  const head = await getGenreHead(slug);
  if (!head) notFound();

  const { genre, stat, engagement, earnings, serverSize } = head;
  const id = genre.id;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        breadcrumbs={[{ label: "Genres", href: "/genres" }]}
        crumb={genre.name}
        title={
          <span className="inline-flex items-center gap-2.5">
            <GenreDot genre={genre.slug} className="size-3.5" />
            {genre.name}
          </span>
        }
        description={genre.description}
        actions={
          <>
            <CompareButton kind="genre" id={genre.slug} name={genre.name} />
            <WatchlistButton kind="genre" id={genre.slug} name={genre.name} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Games" value={formatCompact(stat?.gameCount ?? 0)} />
        <StatTile label="Players now" value={formatCompact(stat?.totalPlaying ?? 0)} />
        <StatTile label="Total visits" value={formatCompact(stat?.totalVisits ?? 0)} />
        <StatTile
          label="Est. earnings/day"
          value={earnings ? formatUsdRange(earnings.low, earnings.high) : "—"}
          badge="Est."
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Est. session length"
            value={formatSessionMinutes(engagement?.sessionMinutes ?? null)}
            badge="Est."
            hint={
              engagement?.sessionGames
                ? `From ${formatCompact(engagement.sessionGames)} games' last ${SESSION_ESTIMATE.windowHours}h`
                : undefined
            }
          />
          <StatTile
            label="Favorites per 1K visits"
            value={engagement?.favoritesPer1k != null ? engagement.favoritesPer1k.toFixed(1) : "—"}
          />
          <StatTile
            label="Like ratio"
            value={
              engagement?.likeRatio != null ? `${Math.round(engagement.likeRatio * 100)}%` : "—"
            }
            hint="All votes across the genre"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Est. session length is the genre&apos;s players ÷ its visits per hour over the last{" "}
          {SESSION_ESTIMATE.windowHours}h (Little&apos;s law), so busier games weigh more.{" "}
          <Link
            href={`/games?genre=${slug}&sort=session&view=table`}
            className="underline underline-offset-2"
          >
            Stickiest {genre.name} games
          </Link>{" "}
          ·{" "}
          <Link href="/about#forecasts" className="underline underline-offset-2">
            how it&apos;s estimated
          </Link>
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton title="Insights" className="h-24" />}>
        <InsightsSection genreId={id} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Players over time" className="h-72" />}>
        <PlayersSection head={head} searchParams={props.searchParams} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Market concentration" className="h-64" />}>
        <ConcentrationSection head={head} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Lifecycle" className="h-72" />}>
        <LifecycleSection head={head} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Survival" className="h-72" />}>
        <AnalyticsSections head={head} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Update cadence" className="h-32" />}>
        <CadenceSection genreId={id} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Players after updates" className="h-32" />}>
        <UpdateImpactSection genreId={id} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Game pass pricing" className="h-48" />}>
        <PassPricingSection head={head} />
      </Suspense>

      {serverSize && serverSize.games > 0 && (
        <section id="servers" className="flex scroll-mt-6 flex-col gap-3">
          <div>
            <h2 className="font-medium">Server size</h2>
            <p className="text-sm text-muted-foreground">
              Players per server (the developer&apos;s max-players setting), from each game&apos;s
              latest reading in the last {SESSION_ESTIMATE.windowHours}h.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Typical server size"
              value={serverSize.median !== null ? formatCompact(serverSize.median) : "—"}
              hint={
                serverSize.p25 !== null
                  ? `Middle half ${formatCompact(serverSize.p25)}–${formatCompact(serverSize.p75!)} · ${formatCompact(serverSize.games)} games`
                  : undefined
              }
            />
            <StatTile
              label={`Busy games (${SERVER_SIZE.busyPlayers}+ playing)`}
              value={serverSize.medianBusy !== null ? formatCompact(serverSize.medianBusy) : "—"}
              hint={`Median of ${formatCompact(serverSize.busyGames)} games`}
            />
            <StatTile
              label="Size vs. players (Spearman)"
              value={serverSize.spearman !== null ? serverSize.spearman.toFixed(2) : "—"}
              hint={
                serverSize.spearman !== null
                  ? `${formatCompact(serverSize.spearmanGames)} games with players`
                  : `Needs ${SERVER_SIZE.minCorrelationGames}+ games with players`
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The correlation runs from −1 to 1: above 0 means this genre&apos;s games with bigger
            servers tend to have more players, below 0 fewer. It&apos;s a rank correlation across
            games and says nothing about cause: popular kinds of game may simply use bigger servers.
          </p>
        </section>
      )}

      <Suspense fallback={<SectionSkeleton title="Top games" className="h-96" />}>
        <TopGamesSection slug={slug} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function InsightsSection({ genreId }: { genreId: string }) {
  const { survival, clustering, opportunity, momentum, analyticsAt, moverUniverseIds } =
    await loadAnalytics(genreId);
  const hasAnalytics = !!(survival || clustering || opportunity || momentum);
  const topMovers = (momentum?.topMovers ?? []).filter((m) => moverUniverseIds[m.gameId]);

  return (
    <>
      {hasAnalytics && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Insights</h2>
            <span className="text-xs text-muted-foreground">
              Precomputed
              {analyticsAt && (
                <>
                  {" "}
                  · updated <LocalTime value={analyticsAt} />
                </>
              )}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Opportunity score"
              value={opportunity ? `${opportunity.score.toFixed(1)}` : "—"}
              badge={opportunity ? `#${opportunity.rank}` : undefined}
            />
            <StatTile
              label="Median lifespan"
              value={
                survival?.status === "ok" && survival.medianLifespanWeeks !== null
                  ? `${survival.medianLifespanWeeks} wk`
                  : "—"
              }
            />
            <StatTile
              label="Deaths observed"
              value={survival ? formatCompact(survival.nDeaths) : "—"}
            />
            <StatTile
              label="Avg 7d growth"
              value={
                momentum?.avgGrowth7d !== null && momentum?.avgGrowth7d !== undefined
                  ? formatGrowthPct(momentum.avgGrowth7d)
                  : "—"
              }
            />
          </div>
          {clustering && Object.keys(clustering.archetypeCounts).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <span className="text-sm text-muted-foreground">Trajectory shapes:</span>
              {Object.entries(clustering.archetypeCounts).map(([label, count]) => (
                <Badge key={label} variant="secondary">
                  {label} · {count}
                </Badge>
              ))}
            </div>
          )}
          {topMovers.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col divide-y rounded-lg border">
                <div className="p-3 text-sm text-muted-foreground">Top movers · 7 days</div>
                {topMovers.map((m) => (
                  <Link
                    key={m.gameId}
                    href={`/games/${moverUniverseIds[m.gameId]}`}
                    className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                  >
                    <span className="min-w-0 truncate font-medium">{m.name}</span>
                    <GrowthBadge growth={m.growth7d} />
                  </Link>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Change from each game&apos;s first to its latest reading in the last 7 days. Single
                readings swing with the time of day, so small games can move a lot; the Trending
                page compares daily averages instead.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}

async function PlayersSection({
  head,
  searchParams,
}: {
  head: GenreHead;
  searchParams: SearchParams;
}) {
  const { genre } = head;
  const range = await readRange(searchParams);
  const [series, { forecast }] = await Promise.all([
    getGenreSeries(genre.id, range),
    loadAnalytics(genre.id),
  ]);

  const trendData: TrendPoint[] = series.map((s) => ({
    date: s.collectedAt.toISOString(),
    value: s.totalPlaying,
    coverage: s.coverage,
  }));
  const projection =
    forecast?.status === "ok"
      ? buildProjection(
          forecast,
          series.map((s) => ({ t: s.collectedAt.getTime(), value: s.totalPlaying })),
        )
      : [];
  const lastForecast = forecast?.status === "ok" ? forecast.points.at(-1) : undefined;

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Players over time</h2>
          <PresetLinks
            param="range"
            options={RANGE_OPTIONS}
            current={range}
            clearValue={RANGE_CLEAR_VALUE}
          />
        </div>
        <div className="rounded-lg border p-4">
          <TrendChart
            data={trendData}
            unit="players"
            color={genreColor(genre.slug)}
            movingAverageWindow={5}
            projection={projection}
            emptyMessage="No genre snapshots yet — the collector has only just started."
            ariaLabel={`Line chart of total concurrent players over time for ${genre.name}`}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Each point sums the genre&apos;s games at one collection run. Quiet games are collected
          about once a day, so between collections their latest reading is carried forward for up to{" "}
          {GENRE_CARRY_MAX_AGE_HOURS}h; older readings are left out. The tooltip shows the share of
          the genre&apos;s games a point includes, and hollow markers flag points below{" "}
          {Math.round(LOW_COVERAGE * 100)}%. Shaded spans are periods with no collection.
        </p>
        {forecast?.status === "ok" ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Projection</span> (dashed, Est.): trend{" "}
            <Badge
              variant={
                forecast.trend === "up"
                  ? "secondary"
                  : forecast.trend === "down"
                    ? "destructive"
                    : "outline"
              }
              className="text-[10px]"
            >
              {forecast.trend}
            </Badge>
            {lastForecast && (
              <span className="tabular-nums">
                {" "}
                · ~{formatCompact(lastForecast.forecast)} players {forecast.horizon} collections
                ahead, band {formatCompact(lastForecast.lower)}–{formatCompact(lastForecast.upper)}
              </span>
            )}
            . {forecast.note}
            {projection.length === 0 &&
              " Newer collections have already passed this projection; it's redrawn after the next analytics run."}
          </p>
        ) : (
          forecast && (
            <p className="text-xs text-muted-foreground">
              Not enough genre snapshots yet to project — expected during cold start.
            </p>
          )
        )}
      </section>
    </>
  );
}

async function ConcentrationSection({ head }: { head: GenreHead }) {
  const { genre } = head;
  const { concentration } = await loadAnalytics(genre.id);
  const conc = concentration ? latestWithBaseline(concentration.days) : null;

  return (
    <>
      {conc && concentration && (
        <section id="concentration" className="flex scroll-mt-6 flex-col gap-3">
          <div>
            <h2 className="font-medium">Market concentration</h2>
            <p className="text-sm text-muted-foreground">
              How much of the genre&apos;s players its biggest games hold, from each game&apos;s
              daily average players (UTC days). On {conc.latest.day} its{" "}
              {formatCompact(conc.latest.n)} games with a reading looked like{" "}
              <span className="font-medium text-foreground">
                {concentrationLevel(conc.latest.hhi)}
              </span>
              .{" "}
              <Link href="/saturation#concentration" className="underline underline-offset-2">
                Compare genres
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["top1", "top5", "top10"] as const).map((k) => (
              <StatTile
                key={k}
                label={k === "top1" ? "Biggest game's share" : `Top ${k.slice(3)} share`}
                value={`${Math.round(conc.latest[k] * 100)}%`}
                hint={
                  conc.baseline
                    ? `${Math.round(conc.baseline[k] * 100)}% on ${conc.baseline.day}`
                    : undefined
                }
              />
            ))}
            <StatTile
              label="HHI"
              value={formatCompact(hhiPoints(conc.latest.hhi))}
              hint={`Like ${effectiveGames(conc.latest.hhi)?.toFixed(1) ?? "—"} equal-sized games`}
            />
          </div>
          <div className="rounded-lg border p-4">
            <DailyLinesChart
              data={concentrationRows(concentration.days)}
              lines={[
                { key: "top1", name: "Biggest game" },
                { key: "top5", name: "Top 5" },
                { key: "top10", name: "Top 10" },
              ]}
              format="percent"
              ariaLabel={`Line chart of the share of ${genre.name} players held by its top 1, 5 and 10 games per day`}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            HHI is the sum of every game&apos;s squared share, on a 0–10,000 scale: under 1,500 is
            many small games, over 2,500 a few giants (the usual antitrust bands, used here only as
            labels). A day needs {concentration.minGames}+ games with a reading. Days with no
            collection are gaps, not zeros. Games are grouped by their current genre.
          </p>
        </section>
      )}
    </>
  );
}

async function LifecycleSection({ head }: { head: GenreHead }) {
  const { genre } = head;
  const [lifecycle, { launchBenchmark }] = await Promise.all([
    getGenreLifecycleCached(genre.id),
    loadAnalytics(genre.id),
  ]);
  const launchBand = benchmarkBand(launchBenchmark);

  return (
    <>
      <section id="lifecycle" className="flex scroll-mt-6 flex-col gap-3">
        <div>
          <h2 className="font-medium">Lifecycle</h2>
          <p className="text-sm text-muted-foreground">
            Average players by weeks since a game&apos;s launch, across this genre.
            {launchBand.length > 0 && launchBenchmark && (
              <>
                {" "}
                The shaded band is the <span className="text-foreground">launch benchmark</span>:
                the middle half of daily average players at each day since launch, over the first{" "}
                {launchBenchmark.maxDay} days, from {formatCompact(launchBenchmark.nGames)} games we
                started tracking within {launchBenchmark.nearLaunchDays} days of launch. Games found
                later are left out, since they were found because they were doing well. A day needs{" "}
                {launchBenchmark.minGames}+ games.
              </>
            )}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <LifecycleChart
            data={lifecycle}
            band={launchBand}
            ariaLabel={`Lifecycle chart: average players by weeks since launch for ${genre.name} games`}
          />
        </div>
      </section>
    </>
  );
}

/** Survival, launch cohorts and weekday/hour patterns. */
async function AnalyticsSections({ head }: { head: GenreHead }) {
  const { genre } = head;
  const { survival, cohorts, seasonality } = await loadAnalytics(genre.id);
  const survivalCurve =
    survival?.status === "ok" && survival.curve.length >= 2 ? survival.curve : null;

  return (
    <>
      {survival && (
        <section id="survival" className="flex scroll-mt-6 flex-col gap-3">
          <div>
            <h2 className="font-medium">Survival</h2>
            <p className="text-sm text-muted-foreground">
              Kaplan-Meier estimate of the share of this genre&apos;s games still alive at each age,
              by the &ldquo;dead&rdquo; rule (&lt;5% of peak for 7+ days). Games still alive count
              up to their latest reading.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            {survivalCurve ? (
              <SurvivalChart
                data={survivalCurve}
                medianWeeks={survival.medianLifespanWeeks}
                ariaLabel={`Survival curve: share of ${genre.name} games still alive by weeks since launch`}
              />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-1 text-center text-muted-foreground">
                <p>
                  {survival.status === "insufficient_games"
                    ? "Too few games with a known launch date to estimate survival."
                    : "Survival needs games followed until they die by the dead rule."}
                </p>
                <p className="text-sm">
                  {survival.nDeaths === 0
                    ? "None observed yet — expected during cold start."
                    : "Not enough deaths yet to draw a curve."}
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            n = {formatCompact(survival.nGames)} games · {formatCompact(survival.nDeaths)} deaths
            observed
            {survival.status === "ok" &&
              (survival.medianLifespanWeeks !== null
                ? ` · median lifespan ${survival.medianLifespanWeeks} weeks`
                : " · median not reached (more than half are still alive)")}
          </p>
        </section>
      )}

      {cohorts && cohorts.cohorts.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-medium">Launch cohorts</h2>
            <p className="text-sm text-muted-foreground">
              This genre&apos;s games grouped by launch quarter. Older cohorts with fewer current
              players is a cross-sectional decline signal.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border xl:overflow-visible">
            <CohortTable cohorts={cohorts.cohorts} />
          </div>
        </section>
      )}

      {seasonality && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-medium">When players are on</h2>
            <p className="text-sm text-muted-foreground">
              The genre&apos;s players at each weekday and hour, relative to its own average over
              everything collected: 1.30× means 30% more players than average. Blank cells are hours
              the collector didn&apos;t run.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            {seasonality.status === "ok" && seasonality.byWeekdayHour?.length ? (
              <SeasonalityHeatmap cells={seasonality.byWeekdayHour} />
            ) : seasonality.status === "ok" ? (
              // Payload from before the weekday × hour cells existed (UTC days).
              <div className="flex flex-wrap gap-1.5">
                {seasonality.byWeekday.map((d) => (
                  <Badge key={d.label} variant="outline" className="tabular-nums">
                    {d.label} (UTC) {d.index.toFixed(2)}×
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Needs ≥7 days of history to show weekday and hour patterns
                {seasonality.distinctDays !== undefined
                  ? ` (have ${seasonality.distinctDays}).`
                  : "."}
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}

async function CadenceSection({ genreId }: { genreId: string }) {
  const index = await getUpdateCadence();
  const cadence = index.genres.find((g) => g.genreId === genreId) ?? null;
  const cadenceTop = index.topByGenre[genreId] ?? [];
  const cadenceDays = index.recentDays;

  return (
    <>
      {cadence && (
        <section id="updates" className="flex scroll-mt-6 flex-col gap-3">
          <div>
            <h2 className="font-medium">Update cadence</h2>
            <p className="text-sm text-muted-foreground">
              How often this genre&apos;s games change on Roblox (a publish, or some settings
              edits).{" "}
              <Link href="/updates" className="underline underline-offset-2">
                All genres and the most-updated games
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label={`Updated in the last ${cadenceDays} days`}
              value={
                cadence.updatedRecentlyShare !== null
                  ? `${Math.round(cadence.updatedRecentlyShare * 100)}%`
                  : "—"
              }
              hint={`Of ${formatCompact(cadence.games)} games`}
            />
            <StatTile
              label="Median days since last update"
              value={
                cadence.medianDaysSinceUpdate !== null
                  ? formatCompact(Math.round(cadence.medianDaysSinceUpdate))
                  : "—"
              }
            />
            <StatTile
              label="Typical days between updates"
              value={
                cadence.medianDaysBetween !== null ? cadence.medianDaysBetween.toFixed(1) : "—"
              }
              hint={
                cadence.intervalGames
                  ? `Median of ${formatCompact(cadence.intervalGames)} games' own medians`
                  : "No recorded updates yet"
              }
            />
            <StatTile
              label={`Updates recorded, last ${cadenceDays} days`}
              value={formatCompact(cadence.recentUpdates)}
            />
          </div>
          {cadenceTop.length > 0 && (
            <div className="flex flex-col divide-y rounded-lg border">
              <div className="p-3 text-sm text-muted-foreground">
                Most updated · last {cadenceDays} days
              </div>
              {cadenceTop.map((g) => (
                <Link
                  key={g.id}
                  href={`/games/${g.universeId}`}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate font-medium">{g.name}</span>
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {g.updates} update{g.updates === 1 ? "" : "s"} ·{" "}
                    {formatCompact(g.currentPlaying)} playing
                  </span>
                </Link>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            &ldquo;Updated&rdquo; and &ldquo;days since&rdquo; use every game&apos;s current
            last-updated time. Days between and counts use the updates we recorded, which only
            started recently and see at most one update per collection, so they undercount games
            that update several times a day.
          </p>
        </section>
      )}
    </>
  );
}

async function UpdateImpactSection({ genreId }: { genreId: string }) {
  const { updateImpact } = await loadAnalytics(genreId);

  return (
    <>
      {updateImpact && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-medium">
              Players after updates <Badge variant="outline">Observational</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              How this genre&apos;s games moved after an update (a change in Roblox&apos;s
              &ldquo;last updated&rdquo; time): average players in the window after it vs. the same
              window before. Counts only games averaging {updateImpact.minBaseline}+ players before,
              and leaves out updates with another update in the window. It describes what happened
              around updates, not what they caused: games tend to update before weekends and events,
              when play rises anyway.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {updateImpact.windows.map((w) => (
              <div key={w.hours} className="flex flex-col gap-1 rounded-lg border p-4 text-sm">
                <span className="text-muted-foreground">{w.hours}h after vs. before</span>
                {w.status === "ok" ? (
                  <>
                    <span className="text-xl font-semibold tabular-nums">
                      <GrowthBadge growth={w.medianChangePct} />{" "}
                      <span className="text-sm font-normal text-muted-foreground">median</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      Middle half {formatGrowthPct(w.p25ChangePct)} to{" "}
                      {formatGrowthPct(w.p75ChangePct)} · {Math.round(w.shareUp * 100)}% rose · n ={" "}
                      {formatCompact(w.n)} updates
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Needs {w.needUpdates} measured updates (have {w.n}). Update history only started
                    being kept recently, so this fills in over the coming weeks.
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

async function PassPricingSection({ head }: { head: GenreHead }) {
  const { stat } = head;
  const passPricing = (await getPassPricing()).genres[head.genre.id] ?? null;

  return (
    <>
      {passPricing && passPricing.checkedGames > 0 && (
        <section id="passes" className="flex scroll-mt-6 flex-col gap-3">
          <div>
            <h2 className="font-medium">Game pass pricing</h2>
            <p className="text-sm text-muted-foreground">
              Prices of the game passes on sale in this genre&apos;s games, from{" "}
              {formatCompact(passPricing.checkedGames)} of {formatCompact(stat?.gameCount ?? 0)}{" "}
              games whose pass list we&apos;ve checked (each game is checked about once a week).
              These are list prices, not sales: only Roblox knows what sells.{" "}
              <Link href="/genres#passes" className="underline underline-offset-2">
                Compare genres
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Games with passes"
              value={`${Math.round((passPricing.gamesWithPasses / passPricing.checkedGames) * 100)}%`}
              hint={`${formatCompact(passPricing.gamesWithPasses)} of ${formatCompact(passPricing.checkedGames)} checked`}
            />
            <StatTile
              label="Median passes per game"
              value={passPricing.medianPassesPerGame?.toString() ?? "—"}
              hint="Games with none count as 0"
            />
            <StatTile
              label="Median pass price"
              value={
                passPricing.medianPrice !== null
                  ? `R$${formatCompact(Math.round(passPricing.medianPrice))}`
                  : "—"
              }
              hint={
                passPricing.p25Price !== null
                  ? `Middle half R$${formatCompact(Math.round(passPricing.p25Price))}–${formatCompact(Math.round(passPricing.p75Price!))}`
                  : undefined
              }
            />
            <StatTile
              label="Median cost of all passes"
              value={
                passPricing.medianTotalRobux !== null
                  ? `R$${formatCompact(Math.round(passPricing.medianTotalRobux))}`
                  : "—"
              }
              hint="Per game with passes"
            />
          </div>
          {passPricing.passes > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg border p-4">
              <span className="text-sm text-muted-foreground">
                Price distribution · {formatCompact(passPricing.passes)} passes (Robux)
              </span>
              {PRICE_BUCKETS.map((b, i) => (
                <div key={b.label} className="flex items-center gap-3 text-sm tabular-nums">
                  <span className="w-16 shrink-0 text-muted-foreground">{b.label}</span>
                  <div className="h-3 flex-1 rounded-sm bg-muted">
                    <div
                      className="h-3 rounded-sm bg-primary"
                      style={{ width: `${passPricing.distribution[i] * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right">
                    {Math.round(passPricing.distribution[i] * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

async function TopGamesSection({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: SearchParams;
}) {
  const range = await readRange(searchParams);
  const { topGames, growthByGame } = await getGenreTopGames(slug, range);

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Top games</h2>
          <ExportLinks dataset="games" params={{ genre: slug }} label="Export all games in genre" />
        </div>
        <div className="overflow-x-auto rounded-lg border xl:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Game</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                {growthByGame && <TableHead className="text-right">Δ</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {topGames.games.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={growthByGame ? 5 : 4}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No games tracked in this genre yet.
                  </TableCell>
                </TableRow>
              )}
              {topGames.games.map((game, i) => (
                <TableRow key={game.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/games/${game.universeId}`} className="hover:underline">
                      {game.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(game.currentPlaying)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(game.currentVisits)}
                  </TableCell>
                  {growthByGame && (
                    <TableCell className="text-right tabular-nums">
                      <GrowthBadge growth={growthByGame.get(game.id)?.growthPct ?? null} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );
}
