import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { Suspense, cache } from "react";
import {
  ArrowUpDown,
  ExternalLink,
  RefreshCw,
  Ticket,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  getGameByUniverseId,
  getGameSnapshots,
  getGameUpdateHistory,
  getLatestSnapshots,
  getSimilarGames,
} from "@/lib/db/games";
import { getAnomaliesForGame, getLaunchBenchmarkForGenre } from "@/lib/db/analytics";
import { completeDays, describeLaunchPosition, launchPosition } from "@/lib/launch-benchmark";
import { dailyByAge } from "@/lib/new-releases";
import { getGamePassCatalog } from "@/lib/db/game-passes";
import { PRERENDER_GAMES, getPrerenderUniverseIds, getSmallIcons } from "@/lib/game-icons";
import { deriveSnapshotMetrics, PASS_TIER_NOTE } from "@/lib/earnings/estimate";
import { formatCompact, formatExact, formatRelativeTime, formatUsdRange } from "@/lib/format";
import { creatorPath } from "@/lib/creators";
import { getAllRankLadders, getEngagement } from "@/lib/cached-queries";
import { UNCLASSIFIED_KEY, bestRank, rankHistory, rankRows } from "@/lib/rank-history";
import {
  SESSION_ESTIMATE,
  favoritesPer1kVisits,
  formatSessionMinutes,
  likeRatioTrend,
} from "@/lib/engagement";
import { LIKE_RATIO_MIN_VOTES } from "@/lib/games-list";
import { measureUpdateImpacts, type UpdateWindowImpact } from "@/lib/update-impact";
import { buildTimeline, type TimelineEvent } from "@/lib/game-timeline";
import {
  DEFAULT_GAME_METRIC,
  GAME_METRICS,
  buildMetricSeries,
  cleanDescription,
  parseGameMetric,
  robloxCreatorUrl,
  robloxGameUrl,
  type GameMetric,
} from "@/lib/game-metrics";

import { Badge } from "@/components/ui/badge";
import { PresetLinks } from "@/components/filters/preset-links";
import {
  TrendChart,
  type TrendMarker,
  type TrendValueFormat,
} from "@/components/charts/trend-chart";
import { DailyLinesChart } from "@/components/charts/daily-lines-chart";
import { LocalTime } from "@/components/local-time";
import { StatTile } from "@/components/data-table/stat-tile";
import { SectionSkeleton } from "@/components/data-table/section-skeleton";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { ExportLinks } from "@/components/data-table/export-links";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { CompareButton } from "@/components/compare/compare-button";
import { BadgeEmbed } from "@/components/badge/badge-embed";
import { GenreBadge } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";

import { SITE_URL, pageMetadata } from "@/lib/site";

import { getGameShare } from "./share";

type SearchParams = PageProps<"/games/[universeId]">["searchParams"];

/**
 * The busiest games are built at deploy (Task #96), so their first visitor
 * after a deploy or cold start gets a finished page instead of waiting on every
 * query. Other games render on first visit and are then kept the same way.
 */
export async function generateStaticParams() {
  const ids = await getPrerenderUniverseIds();
  // Cache Components needs at least one param; an empty DB gets a 404 page.
  return ids.length > 0
    ? ids.slice(0, PRERENDER_GAMES).map((universeId) => ({ universeId }))
    : [{ universeId: "0" }];
}

export async function generateMetadata(props: PageProps<"/games/[universeId]">): Promise<Metadata> {
  const { universeId } = await props.params;
  const share = await getGameShare(universeId);
  if (!share) return { title: "Game — rodict" };
  return pageMetadata({
    title: `${share.game.name} — rodict`,
    description: share.description,
    path: `/games/${universeId}`,
  });
}

/**
 * Everything on the page that doesn't depend on the chosen range or metric:
 * the header, stat tiles, notable changes and game passes. It only needs the
 * route param, so it's part of the prerendered page (Task #96); the sections
 * that read the query string stream in after it (Task #97).
 *
 * Caching this also puts the game's icon behind a cache. That request goes to
 * Roblox's live API, so uncached it meant one third-party call per page view.
 *
 * Returns null instead of calling notFound() so the caller decides: throwing a
 * navigation signal from inside a cached function would cache the throw.
 */
async function getGameHead(universeIdParam: string) {
  "use cache";
  cacheLife("hours");

  let universeId: bigint;
  try {
    universeId = BigInt(universeIdParam);
  } catch {
    return null;
  }

  const game = await getGameByUniverseId(universeId);
  if (!game) return null;

  const [latestTwo, anomalies, passCatalog, engagement, icons] = await Promise.all([
    getLatestSnapshots(game.id, 2),
    getAnomaliesForGame(game.id),
    getGamePassCatalog(game.id),
    getEngagement(),
    getSmallIcons([universeId]),
  ]);
  const latest = latestTwo.at(-1);
  const previous = latestTwo.length > 1 ? latestTwo[0] : undefined;

  return {
    game,
    anomalies,
    passCatalog,
    derived: latest ? deriveSnapshotMetrics(latest, previous, passCatalog) : null,
    sessionMinutes: engagement.games.find((g) => g.id === game.id)?.minutes ?? null,
    iconUrl: icons.get(universeIdParam) ?? null,
    // Relative times ("3 days ago") are measured to when this was read.
    now: new Date(),
  };
}

/**
 * Recorded updates with before/after players (Task #63). Measured against the
 * clock inside the cache, so the entry doesn't depend on the request time.
 */
async function getGameUpdates(universeIdParam: string) {
  "use cache";
  cacheLife("hours");

  const head = await getGameHead(universeIdParam);
  if (!head) return null;
  const history = await getGameUpdateHistory(head.game.id);
  const now = new Date();
  return {
    updates: history.updates,
    total: history.total,
    impacts: measureUpdateImpacts(history.updates, history.snapshots, now),
    now,
  };
}

/** The range-dependent part: snapshot history, rank history, launch position. */
async function getGameSeries(universeIdParam: string, range: RangeKey) {
  "use cache";
  cacheLife("hours");

  const head = await getGameHead(universeIdParam);
  if (!head) return null;
  const { game } = head;

  const [snapshots, updates, benchmark, ladders] = await Promise.all([
    getGameSnapshots(game.id, { from: rangeToCutoff(range) }),
    getGameUpdates(universeIdParam),
    game.currentGenreId && game.robloxCreatedAt
      ? getLaunchBenchmarkForGenre(game.currentGenreId)
      : null,
    getAllRankLadders(),
  ]);

  // Rank by daily average players on each day the stored ladders cover
  // (Task #90). Days the range cuts into are skipped: their average would
  // differ from the ladder's.
  const ranks = rankHistory(
    snapshots.map((s) => ({ t: s.collectedAt.getTime(), playing: s.playing })),
    ladders,
    game.currentGenreId ?? UNCLASSIFIED_KEY,
    rangeToCutoff(range),
  );

  // Where the game sits among its genre's launches, on its latest full day
  // since launch that the benchmark covers (Task #83).
  const created = game.robloxCreatedAt;
  const lastAt = snapshots.at(-1)?.collectedAt.getTime();
  const launch =
    benchmark && created && lastAt !== undefined
      ? launchPosition(
          completeDays(
            dailyByAge(
              snapshots.map((s) => ({ t: s.collectedAt.getTime(), playing: s.playing })),
              created,
              benchmark.maxDay,
            ),
            created,
            lastAt,
          ),
          benchmark,
        )
      : null;

  return {
    snapshots,
    updateTimes: updates?.updates ?? [],
    launch,
    launchNearDays: benchmark?.nearLaunchDays ?? null,
    ranks,
    likeTrend: likeRatioTrend(
      snapshots.map((s) => ({
        t: s.collectedAt.getTime(),
        upVotes: s.upVotes,
        downVotes: s.downVotes,
      })),
      LIKE_RATIO_MIN_VOTES,
    ),
  };
}

/**
 * Updates, spikes and drops, big rank moves and the latest pass-list change in
 * one list (Task #110). Range-independent, so it reads the "all" series: the
 * same cache entry the default view of the chart uses.
 */
async function getGameTimeline(universeIdParam: string) {
  "use cache";
  cacheLife("hours");

  const head = await getGameHead(universeIdParam);
  if (!head) return null;
  const [updates, series] = await Promise.all([
    getGameUpdates(universeIdParam),
    getGameSeries(universeIdParam, "all"),
  ]);
  return buildTimeline({
    updates: updates?.impacts ?? [],
    anomalies: head.anomalies?.anomalies ?? [],
    ranks: series?.ranks ?? [],
    passCatalog: head.passCatalog,
  });
}

/** Similar games and their icons (Task #62). */
async function getGameSimilar(universeIdParam: string) {
  "use cache";
  cacheLife("hours");

  const head = await getGameHead(universeIdParam);
  if (!head) return [];
  const { game } = head;
  const similar = await getSimilarGames({
    id: game.id,
    currentGenreId: game.currentGenreId,
    currentPlaying: game.currentPlaying,
    themeIds: game.themes.map((t) => t.themeId),
  });
  const icons = await getSmallIcons(similar.map((g) => g.universeId));
  return similar.map((g) => ({ ...g, icon: icons.get(String(g.universeId)) ?? null }));
}

/** Range and metric from the query string. */
async function readView(searchParams: SearchParams) {
  const sp = await searchParams;
  return {
    range: parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range),
    metric: parseGameMetric(Array.isArray(sp.metric) ? sp.metric[0] : sp.metric),
  };
}

/** One series load per request, shared by the sections that need it. */
const loadSeries = cache(getGameSeries);

/** Per-metric chart labels. Visits/day is derived from cumulative visits. */
const METRIC_CHART: Record<
  GameMetric,
  { title: string; unit: string; format: TrendValueFormat; column: string; note?: string }
> = {
  players: { title: "Players over time", unit: "players", format: "compact", column: "Players" },
  visits: {
    title: "Visits per day",
    unit: "visits/day",
    format: "compact",
    column: "Visits/day",
    note: "Derived: the change in total visits between collections, scaled to a day. Roblox doesn't report this directly, and spans across collection gaps are left out.",
  },
  favorites: {
    title: "Favorites over time",
    unit: "favorites",
    format: "compact",
    column: "Favorites",
  },
  likes: {
    title: "Like ratio over time",
    unit: "liked",
    format: "percent",
    column: "Like ratio",
    note: "Likes ÷ (likes + dislikes) at each collection.",
  },
};

type GameHead = NonNullable<Awaited<ReturnType<typeof getGameHead>>>;

export default async function GameDetailPage(props: PageProps<"/games/[universeId]">) {
  const { universeId: universeIdParam } = await props.params;

  const head = await getGameHead(universeIdParam);
  if (!head) notFound();

  const { game, iconUrl, passCatalog, sessionMinutes, derived, now } = head;
  const passTier = derived?.estimatedDailyEarnings.passTier ?? null;
  const favoritesPer1k = favoritesPer1kVisits(game.currentFavorites, game.currentVisits);

  const gameUrl = robloxGameUrl(game.rootPlaceId);
  const creatorUrl = robloxCreatorUrl(game.creatorId, game.creatorType);
  const creatorPage = creatorPath(game.creatorId, game.creatorType);
  const description = cleanDescription(game.description);
  const descriptionPreview = description?.split("\n")[0].slice(0, 120);
  const lifecycle: { label: string; at: Date | null }[] = [
    { label: "Created on Roblox", at: game.robloxCreatedAt },
    { label: "Last updated", at: game.robloxUpdatedAt },
    { label: "First tracked", at: game.firstSeenAt },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        breadcrumbs={
          game.currentGenre
            ? [
                { label: "Genres", href: "/genres" },
                { label: game.currentGenre.name, href: `/genres/${game.currentGenre.slug}` },
              ]
            : [{ label: "Games", href: "/games" }]
        }
        title={game.name}
        icon={
          iconUrl ? (
            <Image
              src={iconUrl}
              alt=""
              width={64}
              height={64}
              className="glow-primary shrink-0 rounded-lg border"
              unoptimized
            />
          ) : (
            <div className="size-16 shrink-0 rounded-lg border bg-muted" />
          )
        }
        actions={
          <>
            {gameUrl && (
              <a
                href={gameUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors hover:bg-muted"
              >
                Open on Roblox <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <CompareButton kind="game" id={game.universeId.toString()} name={game.name} />
            <WatchlistButton kind="game" id={game.universeId.toString()} name={game.name} />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {game.currentGenre && (
            <GenreBadge name={game.currentGenre.name} slug={game.currentGenre.slug} link />
          )}
          {game.themes.map((t) => (
            <Badge
              key={t.themeId}
              variant="outline"
              render={<Link href={`/themes/${t.theme.slug}`} />}
            >
              {t.theme.name}
            </Badge>
          ))}
          {game.status === "dead" && <Badge variant="destructive">Dead</Badge>}
        </div>
        {game.creatorName && (
          <p className="text-sm text-muted-foreground">
            by{" "}
            {creatorPage ? (
              <Link
                href={creatorPage}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                {game.creatorName}
              </Link>
            ) : (
              game.creatorName
            )}
            {creatorUrl && (
              <a
                href={creatorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex align-middle hover:text-foreground"
                title="Creator on Roblox"
              >
                <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only">Creator on Roblox</span>
              </a>
            )}
          </p>
        )}
      </PageHeader>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {lifecycle.map(({ label, at }) => (
          <div key={label} className="flex flex-col">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>
              {at ? (
                <>
                  <LocalTime value={at} options={{ dateStyle: "medium" }} />{" "}
                  <span className="text-muted-foreground">({formatRelativeTime(at, now)})</span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        ))}
      </dl>

      {description && (
        <details className="group rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer select-none font-medium">
            Description
            <span className="ml-2 font-normal text-muted-foreground group-open:hidden">
              {descriptionPreview}
              {descriptionPreview !== description ? "…" : ""}
            </span>
          </summary>
          <p className="mt-2 whitespace-pre-line wrap-break-word text-muted-foreground">
            {description}
          </p>
        </details>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Players now" value={formatCompact(game.currentPlaying)} />
        <StatTile label="All-time peak" value={formatCompact(game.allTimePeakPlayers)} />
        <StatTile label="Total visits" value={formatCompact(game.currentVisits)} />
        <StatTile label="Favorites" value={formatCompact(game.currentFavorites)} />
        <StatTile
          label="Like ratio"
          value={
            derived?.likeRatio !== null && derived?.likeRatio !== undefined
              ? `${Math.round(derived.likeRatio * 100)}%`
              : "—"
          }
          hint={
            <Suspense fallback={null}>
              <LikeTrendHint universeIdParam={universeIdParam} searchParams={props.searchParams} />
            </Suspense>
          }
        />
        <StatTile
          label="Est. session length"
          value={formatSessionMinutes(sessionMinutes)}
          badge="Est."
          hint={
            sessionMinutes !== null
              ? `Players ÷ visits/hour, last ${SESSION_ESTIMATE.windowHours}h`
              : "Too few visits or readings in the last day"
          }
        />
        <StatTile
          label="Favorites per 1K visits"
          value={favoritesPer1k !== null ? favoritesPer1k.toFixed(1) : "—"}
          hint="All-time favorites ÷ all-time visits"
        />
        <StatTile
          label="Est. earnings/day"
          value={
            derived
              ? formatUsdRange(
                  derived.estimatedDailyEarnings.low,
                  derived.estimatedDailyEarnings.high,
                )
              : "—"
          }
          badge="Est."
          hint={passTier ? PASS_TIER_NOTE[passTier] : "Game passes not checked yet"}
        />
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <SectionSkeleton className="h-72" />
          </div>
        }
      >
        <GameSeriesSections
          universeIdParam={universeIdParam}
          searchParams={props.searchParams}
          head={head}
        />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Timeline" className="h-32" />}>
        <TimelineSection universeIdParam={universeIdParam} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Updates" className="h-32" />}>
        <GameUpdatesSection universeIdParam={universeIdParam} />
      </Suspense>

      {passCatalog && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Game passes</h2>
          <p className="text-sm text-muted-foreground">
            {passCatalog.forSaleCount === 0
              ? "No game passes on sale. "
              : `${passCatalog.forSaleCount} on sale; buying every one costs ${formatExact(passCatalog.totalRobux)} Robux. `}
            Prices are public, but sales aren&apos;t, and developer products aren&apos;t listed at
            all, so this only places the earnings estimate within its range (see{" "}
            <Link href="/about" className="underline underline-offset-2">
              About
            </Link>
            ). List last changed <LocalTime value={passCatalog.changedAt} />; checked weekly.
          </p>
          {passCatalog.passes.length > 0 && (
            <div className="overflow-x-auto rounded-lg border xl:overflow-visible">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Pass</th>
                    <th className="px-3 py-1.5 text-right font-medium">Price (Robux)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...passCatalog.passes]
                    .sort((a, b) => b.price - a.price)
                    .map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-1.5">{p.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatExact(p.price)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <Suspense fallback={<SectionSkeleton title="Similar games" className="h-24" />}>
        <SimilarGamesSection universeIdParam={universeIdParam} />
      </Suspense>

      <section id="badge" className="flex flex-col gap-2">
        <h2 className="font-medium">Embed a live badge</h2>
        <p className="text-sm text-muted-foreground">
          Show this game&apos;s players now or its rank on your own page or README. It links back
          here and refreshes within the hour.
        </p>
        <BadgeEmbed universeId={game.universeId.toString()} origin={SITE_URL} />
      </section>
    </div>
  );
}

/** The like-ratio tile's trend line, over the chosen range. */
async function LikeTrendHint({
  universeIdParam,
  searchParams,
}: {
  universeIdParam: string;
  searchParams: SearchParams;
}) {
  const { range } = await readView(searchParams);
  const series = await loadSeries(universeIdParam, range);
  const likeTrend = series?.likeTrend ?? null;
  if (likeTrend === null) return null;
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? range;
  return `${likeTrend >= 0 ? "+" : "−"}${Math.abs(likeTrend * 100).toFixed(1)} pts over ${range === RANGE_CLEAR_VALUE ? "all history" : rangeLabel}`;
}

/** Launch position, the metric chart and rank history: all follow the range. */
async function GameSeriesSections({
  universeIdParam,
  searchParams,
  head,
}: {
  universeIdParam: string;
  searchParams: SearchParams;
  head: GameHead;
}) {
  const { range, metric } = await readView(searchParams);
  const series = await loadSeries(universeIdParam, range);
  if (!series) return null;

  const { game, anomalies } = head;
  const { snapshots, updateTimes, launch, launchNearDays, ranks } = series;
  const latestRank = ranks.at(-1);
  const hasRanks = ranks.some((r) => r.overall !== null);

  const chart = METRIC_CHART[metric];
  const chartData = buildMetricSeries(snapshots, metric);
  // Anomalies are flagged on the CCU series, so they only belong on that chart.
  const markers: TrendMarker[] =
    metric === "players" && anomalies
      ? anomalies.anomalies.map((a) => ({
          date: a.at,
          value: a.value,
          direction: a.direction,
          changePct: a.changePct,
        }))
      : [];

  return (
    <>
      {launch && game.currentGenre && (
        <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
          <span>
            <span className="font-medium">Day {launch.day}:</span>{" "}
            {describeLaunchPosition(launch, game.currentGenre.name)}{" "}
            <span className="text-muted-foreground tabular-nums">
              ({formatCompact(Math.round(launch.value))} avg players that day)
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            Compared with the daily average players of {formatCompact(launch.nGames)}{" "}
            {game.currentGenre.name} games on their day {launch.day}, counting only games we started
            tracking within {launchNearDays} days of launch, so games found only after they took off
            don&apos;t raise the bar.{" "}
            <Link
              href={`/genres/${game.currentGenre.slug}#lifecycle`}
              className="underline underline-offset-2"
            >
              Genre launch curve
            </Link>
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-medium">
            {chart.title}
            {metric === "visits" && <Badge variant="outline">Derived</Badge>}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <PresetLinks
              param="metric"
              options={GAME_METRICS}
              current={metric}
              clearValue={DEFAULT_GAME_METRIC}
              baseParams={{ range: range === RANGE_CLEAR_VALUE ? undefined : range }}
            />
            <PresetLinks
              param="range"
              options={RANGE_OPTIONS}
              current={range}
              clearValue={RANGE_CLEAR_VALUE}
              baseParams={{ metric: metric === DEFAULT_GAME_METRIC ? undefined : metric }}
            />
          </div>
        </div>
        {chart.note && <p className="text-sm text-muted-foreground">{chart.note}</p>}
        <div className="flex justify-end">
          <ExportLinks
            dataset="snapshots"
            params={{ game: universeIdParam, range }}
            label="Export snapshot history"
          />
        </div>
        <div className="rounded-lg border p-4">
          <TrendChart
            data={chartData}
            unit={chart.unit}
            valueFormat={chart.format}
            markers={markers}
            events={metric === "players" ? updateTimes.map((u) => u.toISOString()) : []}
            eventLabel="Update"
            emptyMessage={
              metric === "visits" && snapshots.length > 0
                ? "Needs two collections close together to derive visits per day."
                : "No snapshots in this range yet."
            }
            emptyHint="Busy games are collected every 3 hours and quiet ones about once a day, so a newly found game's line fills in over a day or two. A longer range may help: nothing was collected from 20 Aug to 29 Sep 2026."
            ariaLabel={`Line chart of ${game.name}: ${chart.title.toLowerCase()}`}
          />
        </div>
        {chartData.length > 0 && (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              View as table
            </summary>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Collected at</th>
                    <th className="px-3 py-1.5 text-right font-medium">{chart.column}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...chartData].reverse().map((p) => (
                    <tr key={p.date} className="border-t">
                      <td className="px-3 py-1.5">
                        <LocalTime value={p.date} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {chart.format === "percent"
                          ? `${(p.value * 100).toFixed(1)}%`
                          : formatExact(p.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      {ranks.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-medium">Rank history</h2>
            <p className="text-sm text-muted-foreground">
              Where this game ranked by daily average players each day (UTC), among every tracked
              game and within {game.currentGenre ? game.currentGenre.name : "unclassified games"}.
              Games collected more often don&apos;t count more: every game is one daily average.
              {latestRank && latestRank.overall !== null && (
                <>
                  {" "}
                  Latest (
                  {new Date(latestRank.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                  ):{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    #{formatExact(latestRank.overall)}
                  </span>{" "}
                  of {formatExact(latestRank.overallOf)} overall,{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    #{formatExact(latestRank.genre!)}
                  </span>{" "}
                  of {formatExact(latestRank.genreOf)} in genre. Best in this range: #
                  {formatExact(bestRank(ranks, "overall")!)} overall.
                </>
              )}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <DailyLinesChart
              data={hasRanks ? rankRows(ranks) : []}
              lines={[
                { key: "overall", name: "Overall" },
                {
                  key: "genre",
                  name: game.currentGenre ? `In ${game.currentGenre.name}` : "In genre",
                },
              ]}
              format="rank"
              emptyMessage="Averaged under 1 player on every day in range, so unranked."
              ariaLabel={`Line chart of ${game.name}'s daily rank by players, overall and in its genre`}
            />
          </div>
        </section>
      )}
    </>
  );
}

const TIMELINE_ICON = {
  update: { icon: RefreshCw, className: "text-teal-500" },
  spike: { icon: TrendingUp, className: "text-emerald-500" },
  drop: { icon: TrendingDown, className: "text-red-500" },
  rank: { icon: ArrowUpDown, className: "text-indigo-500" },
  passes: { icon: Ticket, className: "text-amber-500" },
} as const;

const utcDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

async function TimelineSection({ universeIdParam }: { universeIdParam: string }) {
  const timeline = await getGameTimeline(universeIdParam);
  if (!timeline || timeline.events.length === 0) return null;
  const { events, total } = timeline;

  return (
    <section id="timeline" className="flex flex-col gap-2">
      <h2 className="font-medium">Timeline</h2>
      <p className="text-sm text-muted-foreground">
        What we recorded for this game, newest first: updates (Roblox&apos;s &ldquo;last
        updated&rdquo; time changing), automatically flagged spikes and drops in players, days its
        overall rank at least halved or doubled, and the latest change to its game-pass list
        (earlier lists aren&apos;t kept). It shows what happened together, not what caused what.
        {total > events.length && ` Showing the latest ${events.length} of ${total}.`}
      </p>
      <ol className="flex flex-col divide-y rounded-lg border">
        {events.map((e) => {
          const { icon: Icon, className } = TIMELINE_ICON[e.kind];
          return (
            <li key={`${e.kind}-${e.at}`} className="flex items-start gap-3 p-3 text-sm">
              <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <TimelineText event={e} />
                <span className="text-xs text-muted-foreground">
                  {e.kind === "rank" ? `${utcDay(e.at)} (UTC day)` : <LocalTime value={e.at} />}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TimelineText({ event: e }: { event: TimelineEvent }) {
  switch (e.kind) {
    case "update":
      return (
        <span>
          <span className="font-medium">Updated</span>
          <span className="text-muted-foreground">
            {e.pending
              ? " · 24h after still measuring"
              : e.change24h === null
                ? ""
                : " · avg players 24h after vs. before: "}
          </span>
          {e.change24h !== null && <GrowthBadge growth={e.change24h} />}
        </span>
      );
    case "spike":
    case "drop":
      return (
        <span className="tabular-nums">
          <span className="font-medium">{e.kind === "spike" ? "Player spike" : "Player drop"}</span>{" "}
          <span className="text-muted-foreground">
            {`${formatCompact(e.from)} → ${formatCompact(e.to)}`}
          </span>{" "}
          <GrowthBadge growth={e.changePct} />
        </span>
      );
    case "rank":
      return (
        <span className="tabular-nums">
          <span className="font-medium">
            {e.to < e.from ? "Climbed in overall rank" : "Fell in overall rank"}
          </span>{" "}
          <span className="text-muted-foreground">
            {`#${formatExact(e.from)} → #${formatExact(e.to)} of ${formatExact(e.overallOf)}`}
            {e.genre !== null && ` · #${formatExact(e.genre)} in genre`}
          </span>
        </span>
      );
    case "passes":
      return (
        <span className="tabular-nums">
          <span className="font-medium">Game-pass list last changed</span>{" "}
          <span className="text-muted-foreground">
            {e.forSaleCount === 0
              ? "· none on sale"
              : `· ${formatExact(e.forSaleCount)} on sale, ${formatExact(e.totalRobux)} Robux for all`}
          </span>
        </span>
      );
  }
}

async function GameUpdatesSection({ universeIdParam }: { universeIdParam: string }) {
  const data = await getGameUpdates(universeIdParam);
  if (!data || data.impacts.length === 0) return null;
  const { impacts, total, now } = data;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 font-medium">
        Updates <Badge variant="outline">Observational</Badge>
      </h2>
      <p className="text-sm text-muted-foreground">
        Each time Roblox&apos;s &ldquo;last updated&rdquo; time changed (a publish, or some settings
        edits), with average players in the 24 and 72 hours before vs. after. This shows what
        happened around an update, not what it caused: weekends, events and other changes land in
        the same windows. History starts with the time each game showed when update tracking began;
        earlier updates weren&apos;t kept.
        {total > impacts.length && ` Showing the latest ${impacts.length} of ${total}.`}
      </p>
      <div className="overflow-x-auto rounded-lg border xl:overflow-visible">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Updated</th>
              <th className="px-3 py-1.5 text-right font-medium">24h before → after</th>
              <th className="px-3 py-1.5 text-right font-medium">72h before → after</th>
            </tr>
          </thead>
          <tbody>
            {impacts.map((u) => (
              <tr key={u.updatedAt.toISOString()} className="border-t">
                <td className="px-3 py-1.5">
                  <LocalTime value={u.updatedAt} />{" "}
                  <span className="text-muted-foreground">
                    ({formatRelativeTime(u.updatedAt, now)})
                  </span>
                </td>
                {u.windows.map((w) => (
                  <td key={w.hours} className="px-3 py-1.5 text-right tabular-nums">
                    <ImpactCell window={w} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function SimilarGamesSection({ universeIdParam }: { universeIdParam: string }) {
  const similar = await getGameSimilar(universeIdParam);
  if (similar.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">Similar games</h2>
      <p className="text-sm text-muted-foreground">
        Same genre and a similar number of players right now; games sharing more themes come first.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {similar.map((g) => (
          <Link
            key={g.id}
            href={`/games/${g.universeId}`}
            className="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:border-primary/50"
          >
            {g.icon ? (
              <Image
                src={g.icon}
                alt=""
                width={40}
                height={40}
                className="shrink-0 rounded-md border"
                unoptimized
              />
            ) : (
              <div className="size-10 shrink-0 rounded-md border bg-muted" />
            )}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{g.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatCompact(g.currentPlaying)} playing
                {g.sharedThemes > 0 &&
                  ` · ${g.sharedThemes} shared theme${g.sharedThemes > 1 ? "s" : ""}`}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** One before → after window. Readings per side are in the tooltip, since a
 * quiet game collected daily may have a single reading on each side. */
function ImpactCell({ window: w }: { window: UpdateWindowImpact }) {
  if (w.status === "pending") return <span className="text-muted-foreground">Measuring…</span>;
  if (w.status === "no_data") {
    return (
      <span className="text-muted-foreground" title="No readings on one side of the update">
        —
      </span>
    );
  }
  return (
    <span
      className="inline-flex flex-col items-end"
      title={`${w.nBefore} reading${w.nBefore === 1 ? "" : "s"} before, ${w.nAfter} after`}
    >
      <span>
        <span className="text-muted-foreground">
          {formatCompact(Math.round(w.before!))} → {formatCompact(Math.round(w.after!))}
        </span>{" "}
        <GrowthBadge growth={w.changePct} />
      </span>
      {w.overlapped && (
        <span className="text-xs text-muted-foreground">overlaps another update</span>
      )}
    </span>
  );
}
