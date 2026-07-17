import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";

import { getGenreBySlug } from "@/lib/db/genres";
import { getGenreStatBySlug, getGenreLifecycle } from "@/lib/db/genre-stats";
import { getGenreSnapshots } from "@/lib/db/genre-snapshots";
import { getGamesList } from "@/lib/db/games";
import { getGrowthForGames } from "@/lib/db/trends";
import {
  getSurvivalForGenre,
  getClusteringForGenre,
  getOpportunityForGenre,
  getMomentumForGenre,
  getCohortsForGenre,
  getSeasonalityForGenre,
  getForecastForGenre,
  getAnalyticsComputedAt,
} from "@/lib/db/analytics";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";
import { formatGrowthPct } from "@/lib/stats";

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
import { LifecycleChart } from "@/components/charts/lifecycle-chart";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { StatTile } from "@/components/data-table/stat-tile";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { PresetLinks } from "@/components/filters/preset-links";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";

export async function generateMetadata(props: PageProps<"/genres/[slug]">) {
  const { slug } = await props.params;
  const genre = await getGenreBySlug(slug);
  return { title: genre ? `${genre.name} — rodict` : "Genre — rodict" };
}

/**
 * The heaviest read on the site — 13 queries for one page. Uncached, every view
 * paid all of them to render numbers the analytics jobs only refresh after a
 * collection. Returns null rather than calling notFound() so the navigation
 * signal isn't thrown (and cached) from inside the cache.
 */
async function getGenreDetail(slug: string, range: RangeKey) {
  "use cache";
  cacheLife("hours");

  const genre = await getGenreBySlug(slug);
  if (!genre) return null;

  const cutoff = rangeToCutoff(range);

  const [
    stat,
    series,
    lifecycle,
    topGames,
    survival,
    clustering,
    opportunity,
    momentum,
    cohorts,
    seasonality,
    forecast,
    analyticsAt,
  ] = await Promise.all([
    getGenreStatBySlug(slug),
    getGenreSnapshots(genre.id, { from: cutoff }),
    getGenreLifecycle(genre.id),
    getGamesList({ genreSlug: slug, sort: "currentPlaying", order: "desc", limit: 10 }),
    getSurvivalForGenre(genre.id),
    getClusteringForGenre(genre.id),
    getOpportunityForGenre(genre.id),
    getMomentumForGenre(genre.id),
    getCohortsForGenre(genre.id),
    getSeasonalityForGenre(genre.id),
    getForecastForGenre(genre.id),
    getAnalyticsComputedAt(),
  ]);

  // A range narrower than "all" adds a Δ column to top games, scoped to just
  // these 10 rows (Task #19) — same pattern as the games list.
  const growthByGame = cutoff
    ? await getGrowthForGames(
        topGames.games.map((g) => g.id),
        cutoff,
      )
    : null;

  return {
    genre,
    stat,
    series,
    lifecycle,
    topGames,
    survival,
    clustering,
    opportunity,
    momentum,
    cohorts,
    seasonality,
    forecast,
    analyticsAt,
    growthByGame,
    // Priced at the as-of date rather than "now" so the cached entry doesn't
    // depend on when it happens to be read.
    earnings: stat ? estimateDailyEarningsFromCcu(stat.totalPlaying, cutoff ?? new Date()) : null,
  };
}

export default async function GenreDetailPage(props: PageProps<"/genres/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const data = await getGenreDetail(slug, range);
  if (!data) notFound();

  const {
    genre,
    stat,
    series,
    lifecycle,
    topGames,
    survival,
    clustering,
    opportunity,
    momentum,
    cohorts,
    seasonality,
    forecast,
    analyticsAt,
    growthByGame,
    earnings,
  } = data;

  const hasAnalytics = !!(survival || clustering || opportunity || momentum);

  const trendData: TrendPoint[] = series.map((s) => ({
    date: s.collectedAt.toISOString(),
    value: s.totalPlaying,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link href="/genres" className="text-sm text-muted-foreground hover:text-foreground">
            ← All genres
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{genre.name}</h1>
          {genre.description && <p className="text-muted-foreground">{genre.description}</p>}
        </div>
        <WatchlistButton kind="genre" id={genre.slug} name={genre.name} />
      </div>

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

      {hasAnalytics && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Insights</h2>
            <span className="text-xs text-muted-foreground">
              Precomputed
              {analyticsAt &&
                ` · updated ${analyticsAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
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
          {survival?.status === "insufficient_deaths" && (
            <p className="text-xs text-muted-foreground">
              Survival (median lifespan) needs games followed until they die by the
              &ldquo;dead&rdquo; rule (&lt;5% of peak for 7+ days). None observed yet — expected
              during cold start.
            </p>
          )}
        </section>
      )}

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
            movingAverageWindow={5}
            emptyMessage="No genre snapshots yet — the collector has only just started."
            ariaLabel={`Line chart of total concurrent players over time for ${genre.name}`}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Lifecycle</h2>
          <p className="text-sm text-muted-foreground">
            Average players by weeks since a game&apos;s launch, across this genre.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <LifecycleChart
            data={lifecycle}
            ariaLabel={`Lifecycle chart: average players by weeks since launch for ${genre.name} games`}
          />
        </div>
      </section>

      {cohorts && cohorts.cohorts.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-medium">Launch cohorts</h2>
            <p className="text-sm text-muted-foreground">
              This genre&apos;s games grouped by launch quarter. Older cohorts with fewer current
              players is a cross-sectional decline signal.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Launched</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Avg players</TableHead>
                  <TableHead className="text-right">Avg age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.cohorts.map((c) => (
                  <TableRow key={c.cohort}>
                    <TableCell className="font-medium">{c.cohort}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.nGames}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(Math.round(c.avgPlaying))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(c.avgAgeWeeks)} wk
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {(forecast || seasonality) && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Projection &amp; seasonality</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium">Near-term projection</div>
              {forecast?.status === "ok" ? (
                <div className="mt-2 flex flex-col gap-1 text-sm">
                  <span>
                    Trend:{" "}
                    <Badge
                      variant={
                        forecast.trend === "up"
                          ? "secondary"
                          : forecast.trend === "down"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {forecast.trend}
                    </Badge>
                  </span>
                  {forecast.points[forecast.points.length - 1] && (
                    <span className="text-muted-foreground tabular-nums">
                      ~{formatCompact(forecast.points[forecast.points.length - 1].forecast)} players
                      in {forecast.horizon} steps (band{" "}
                      {formatCompact(forecast.points[forecast.points.length - 1].lower)}–
                      {formatCompact(forecast.points[forecast.points.length - 1].upper)})
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{forecast.note}</span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Not enough genre snapshots yet to project — expected during cold start.
                </p>
              )}
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm font-medium">Weekly seasonality</div>
              {seasonality?.status === "ok" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {seasonality.byWeekday.map((d) => (
                    <Badge key={d.label} variant="outline" className="tabular-nums">
                      {d.label} {d.index.toFixed(2)}×
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Needs ≥7 days of history to detect day-of-week effects
                  {seasonality?.distinctDays !== undefined
                    ? ` (have ${seasonality.distinctDays}).`
                    : "."}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Top games</h2>
        <div className="overflow-x-auto rounded-lg border">
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
    </div>
  );
}
