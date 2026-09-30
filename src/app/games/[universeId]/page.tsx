import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { ExternalLink } from "lucide-react";

import {
  getGameByUniverseId,
  getGameSnapshots,
  getGameUpdateHistory,
  getSimilarGames,
} from "@/lib/db/games";
import { getAnomaliesForGame } from "@/lib/db/analytics";
import { getGamePassCatalog } from "@/lib/db/game-passes";
import { getGameIcons } from "@/lib/roblox/client";
import { deriveSnapshotMetrics, PASS_TIER_NOTE } from "@/lib/earnings/estimate";
import { formatCompact, formatExact, formatRelativeTime, formatUsdRange } from "@/lib/format";
import { formatGrowthPct } from "@/lib/stats";
import { creatorPath } from "@/lib/creators";
import { measureUpdateImpacts, type UpdateWindowImpact } from "@/lib/update-impact";
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
import { LocalTime } from "@/components/local-time";
import { StatTile } from "@/components/data-table/stat-tile";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { ExportLinks } from "@/components/data-table/export-links";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { CompareButton } from "@/components/compare/compare-button";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";

/**
 * Caching this also puts the game's icon behind a cache. That request goes to
 * Roblox's live API on render, so uncached it meant one third-party call per
 * page view of a page whose data only changes every 3h — exactly the kind of
 * traffic that earns a rate limit from a semi-official API.
 *
 * Returns null instead of calling notFound() so the caller decides: throwing a
 * navigation signal from inside a cached function would cache the throw.
 */
async function getGameDetail(universeIdParam: string, range: RangeKey) {
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

  // Similar games' icons ride along in the same Roblox icon request as this
  // game's, so the page still makes one third-party call.
  const similarWithIcons = getSimilarGames({
    id: game.id,
    currentGenreId: game.currentGenreId,
    currentPlaying: game.currentPlaying,
    themeIds: game.themes.map((t) => t.themeId),
  }).then(async (similar) => {
    const icons = await getGameIcons([universeId, ...similar.map((g) => g.universeId)]);
    return { similar, icons: new Map(icons.map((i) => [String(i.universeId), i.imageUrl])) };
  });

  const [snapshots, anomalies, updateHistory, { similar, icons }, passCatalog] = await Promise.all([
    getGameSnapshots(game.id, { from: rangeToCutoff(range) }),
    getAnomaliesForGame(game.id),
    getGameUpdateHistory(game.id),
    similarWithIcons,
    getGamePassCatalog(game.id),
  ]);

  return {
    game,
    snapshots,
    anomalies,
    updateHistory,
    similar,
    icons,
    passCatalog,
    iconUrl: icons.get(String(universeId)) ?? null,
  };
}

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

export default async function GameDetailPage(props: PageProps<"/games/[universeId]">) {
  const { universeId: universeIdParam } = await props.params;
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const metric = parseGameMetric(Array.isArray(sp.metric) ? sp.metric[0] : sp.metric);

  const data = await getGameDetail(universeIdParam, range);
  if (!data) notFound();

  const { game, snapshots, anomalies, updateHistory, similar, icons, iconUrl, passCatalog } = data;
  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : undefined;
  const derived = latest ? deriveSnapshotMetrics(latest, previous, passCatalog) : null;
  const passTier = derived?.estimatedDailyEarnings.passTier ?? null;

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

  // Past the searchParams await the page renders per request, so reading the
  // clock here can't bake a build-time value into a prerender.
  const now = new Date();
  const updateImpacts = measureUpdateImpacts(updateHistory.updates, updateHistory.snapshots, now);
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {iconUrl ? (
            <Image
              src={iconUrl}
              alt=""
              width={64}
              height={64}
              className="glow-primary rounded-lg border"
              unoptimized
            />
          ) : (
            <div className="size-16 rounded-lg border bg-muted" />
          )}
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{game.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              {game.currentGenre && <Badge variant="secondary">{game.currentGenre.name}</Badge>}
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
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

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
            events={metric === "players" ? updateHistory.updates.map((u) => u.toISOString()) : []}
            eventLabel="Update"
            emptyMessage={
              metric === "visits" && snapshots.length > 0
                ? "Needs two collections close together to derive visits per day."
                : "No snapshots in this range yet."
            }
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

      {anomalies && anomalies.nAnomalies > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Notable changes</h2>
          <p className="text-sm text-muted-foreground">
            Automatically flagged spikes and drops — moves that are both large relative to this
            game&apos;s typical step-to-step change and substantial in their own right. They&apos;re
            also marked on the Players chart.
          </p>
          <div className="flex flex-col divide-y rounded-lg border">
            {[...anomalies.anomalies].reverse().map((a) => (
              <div key={a.at} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="text-muted-foreground">
                  <LocalTime value={a.at} />
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="text-muted-foreground">
                    {formatCompact(a.prevValue)} → {formatCompact(a.value)}
                  </span>
                  <Badge variant={a.direction === "spike" ? "secondary" : "destructive"}>
                    {a.direction === "spike" ? "▲" : "▼"} {formatGrowthPct(a.changePct)}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {updateImpacts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 font-medium">
            Updates <Badge variant="outline">Observational</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            Each time Roblox&apos;s &ldquo;last updated&rdquo; time changed (a publish, or some
            settings edits), with average players in the 24 and 72 hours before vs. after. This
            shows what happened around an update, not what it caused: weekends, events and other
            changes land in the same windows. History starts with the time each game showed when
            update tracking began; earlier updates weren&apos;t kept.
            {updateHistory.total > updateImpacts.length &&
              ` Showing the latest ${updateImpacts.length} of ${updateHistory.total}.`}
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Updated</th>
                  <th className="px-3 py-1.5 text-right font-medium">24h before → after</th>
                  <th className="px-3 py-1.5 text-right font-medium">72h before → after</th>
                </tr>
              </thead>
              <tbody>
                {updateImpacts.map((u) => (
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
      )}

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
            <div className="overflow-x-auto rounded-lg border">
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

      {similar.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Similar games</h2>
          <p className="text-sm text-muted-foreground">
            Same genre and a similar number of players right now; games sharing more themes come
            first.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((g) => {
              const icon = icons.get(String(g.universeId)) ?? null;
              return (
                <Link
                  key={g.id}
                  href={`/games/${g.universeId}`}
                  className="flex items-center gap-3 rounded-lg border p-2 transition-colors hover:border-primary/50"
                >
                  {icon ? (
                    <Image
                      src={icon}
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
              );
            })}
          </div>
        </section>
      )}
    </div>
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
