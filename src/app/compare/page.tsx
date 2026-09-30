import type { ReactNode } from "react";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { X } from "lucide-react";

import { getCompareGames, getCompareGenres } from "@/lib/db/compare";
import { RISING } from "@/lib/db/trends";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";
import { SERIES_GAP_DAYS } from "@/lib/stats";
import { genreColor } from "@/lib/genre-colors";
import {
  COMPARE_MAX,
  compareHref,
  indexSeries,
  parseCompareScale,
  parseCompareSelection,
  seriesColor,
  windowAverageChange,
  withRemoved,
  type CompareKind,
  type CompareScale,
  type CompareSelection,
  type SeriesPoint,
} from "@/lib/compare";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";

import { Badge } from "@/components/ui/badge";
import { PresetLinks } from "@/components/filters/preset-links";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { CompareChart } from "@/components/charts/compare-chart";
import { GenreBadge } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";
import { LabelWithHelp } from "@/components/metric-help";
import type { GlossaryKey } from "@/lib/glossary";
import { CompareSync } from "./_components/compare-sync";
import { CompareSuggestions } from "./_components/compare-suggestions";

export const metadata = { title: "Compare — rodict" };

const SCALE_OPTIONS = [
  { value: "absolute", label: "Players" },
  { value: "indexed", label: "Indexed (start = 100)" },
] as const;

const GAP_MS = SERIES_GAP_DAYS * 86_400_000;
const AVG_WINDOW_MS = RISING.avgWindowHours * 3_600_000;

/** Keyed on the id lists and range KEY (see /trending on why not a cutoff Date). */
async function getCompareData(games: string[], genres: string[], range: RangeKey) {
  "use cache";
  cacheLife("hours");
  const from = rangeToCutoff(range);
  const [gameRows, genreRows] = await Promise.all([
    getCompareGames(games, from),
    getCompareGenres(genres, from),
  ]);
  return { gameRows, genreRows };
}

function scaled(points: SeriesPoint[], scale: CompareScale) {
  return scale === "indexed" ? indexSeries(points) : points;
}

export default async function ComparePage(props: PageProps<"/compare">) {
  const sp = await props.searchParams;
  const get = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const requested = parseCompareSelection({ games: get("games"), genres: get("genres") });
  const range = parseRangeKey(get("range"));
  const scale = parseCompareScale(get("scale"));

  const { gameRows, genreRows } = await getCompareData(requested.games, requested.genres, range);
  // Ids that aren't tracked are dropped from what's shown and remembered.
  const selection: CompareSelection = {
    games: gameRows.map((r) => r.game.universeId.toString()),
    genres: genreRows.map((r) => r.genre.slug),
  };
  const dropped =
    requested.games.length +
    requested.genres.length -
    selection.games.length -
    selection.genres.length;

  const extra = {
    range: range === RANGE_CLEAR_VALUE ? undefined : range,
    scale: scale === "absolute" ? undefined : scale,
  };
  const baseParams = {
    games: selection.games.join(",") || undefined,
    genres: selection.genres.join(",") || undefined,
  };
  const empty = gameRows.length === 0 && genreRows.length === 0;
  const now = new Date();

  // Genres wear their own color (Task #106); games take the series slots.
  const colorFor = (kind: CompareKind, id: string, i: number) =>
    kind === "genre" ? genreColor(id) : seriesColor(i);
  const chip = (kind: CompareKind, id: string, name: string, i: number) => (
    <span
      key={`${kind}:${id}`}
      className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 text-sm"
    >
      <span className="size-2.5 rounded-full" style={{ background: colorFor(kind, id, i) }} />
      <Link
        href={kind === "game" ? `/games/${id}` : `/genres/${id}`}
        className="max-w-56 truncate hover:underline"
      >
        {name}
      </Link>
      <Link
        href={compareHref(withRemoved(selection, kind, id), extra)}
        aria-label={`Remove ${name} from comparison`}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </Link>
    </span>
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <CompareSync selection={selection} />
      <PageHeader
        title="Compare"
        description={`Up to ${COMPARE_MAX} games and ${COMPARE_MAX} genres side by side. The link holds the comparison, so it can be shared. Add more with the Compare button on any game or genre page.`}
      />

      <div className="flex flex-col gap-3">
        {!empty && (
          <div className="flex flex-wrap items-center gap-3">
            <PresetLinks
              param="range"
              options={RANGE_OPTIONS}
              current={range}
              clearValue={RANGE_CLEAR_VALUE}
              baseParams={{ ...baseParams, scale: extra.scale }}
            />
            <PresetLinks
              param="scale"
              options={SCALE_OPTIONS}
              current={scale}
              clearValue="absolute"
              baseParams={{ ...baseParams, range: extra.range }}
            />
          </div>
        )}
        <CompareSuggestions selection={selection} extra={extra} />
        {dropped > 0 && (
          <p className="text-sm text-muted-foreground">
            {dropped} item{dropped === 1 ? " in the link isn't" : "s in the link aren't"} tracked
            and {dropped === 1 ? "was" : "were"} left out.
          </p>
        )}
      </div>

      {empty && (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-muted-foreground">
          <p>Nothing to compare yet.</p>
          <p className="text-sm">
            Open a{" "}
            <Link href="/games" className="underline">
              game
            </Link>{" "}
            or{" "}
            <Link href="/genres" className="underline">
              genre
            </Link>{" "}
            and press Compare.
          </p>
        </div>
      )}

      {gameRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-1 font-medium">Games</h2>
            {gameRows.map(({ game }, i) => chip("game", game.universeId.toString(), game.name, i))}
          </div>
          <div className="rounded-lg border p-4">
            <CompareChart
              series={gameRows.map(({ game, points }, i) => ({
                key: `s${i}`,
                name: game.name,
                points: scaled(points, scale),
              }))}
              scale={scale}
              gapMs={GAP_MS}
              ariaLabel={`Line chart comparing concurrent players over time for ${gameRows
                .map((r) => r.game.name)
                .join(", ")}`}
            />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
            {gameRows.map(({ game, points }, i) => {
              const change = windowAverageChange(points, AVG_WINDOW_MS);
              const earnings = estimateDailyEarningsFromCcu(
                game.currentPlaying,
                now,
                game.passCatalog,
              );
              const votes = game.currentUpVotes + game.currentDownVotes;
              return (
                <EntityCard
                  key={game.id}
                  color={seriesColor(i)}
                  title={game.name}
                  href={`/games/${game.universeId}`}
                  subtitle={
                    game.currentGenre ? (
                      <GenreBadge name={game.currentGenre.name} slug={game.currentGenre.slug} />
                    ) : (
                      "No genre"
                    )
                  }
                  stats={[
                    ["Players now", formatCompact(game.currentPlaying)],
                    ["All-time peak", formatCompact(game.allTimePeakPlayers)],
                    ["Visits", formatCompact(game.currentVisits)],
                    ["Favorites", formatCompact(game.currentFavorites)],
                    [
                      "Like ratio",
                      votes > 0 ? `${Math.round((game.currentUpVotes / votes) * 100)}%` : "—",
                    ],
                    [
                      "Est. earnings/day",
                      <span key="e" className="inline-flex items-center gap-1">
                        {formatUsdRange(earnings.low, earnings.high)}
                        <Badge variant="outline" className="text-[10px]">
                          Est.
                        </Badge>
                      </span>,
                    ],
                    ["Change in range", <GrowthBadge key="g" growth={change?.pct ?? null} />],
                  ]}
                  status={game.status === "dead" ? "Dead" : undefined}
                />
              );
            })}
          </div>
        </section>
      )}

      {genreRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-1 font-medium">Genres</h2>
            {genreRows.map(({ genre }, i) => chip("genre", genre.slug, genre.name, i))}
          </div>
          <div className="rounded-lg border p-4">
            <CompareChart
              series={genreRows.map(({ genre, points }, i) => ({
                key: `s${i}`,
                name: genre.name,
                color: genreColor(genre.slug),
                points: scaled(points, scale),
              }))}
              scale={scale}
              gapMs={GAP_MS}
              ariaLabel={`Line chart comparing total concurrent players over time for ${genreRows
                .map((r) => r.genre.name)
                .join(", ")}`}
            />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
            {genreRows.map(({ genre, stat, points }) => {
              const change = windowAverageChange(points, AVG_WINDOW_MS);
              const earnings = estimateDailyEarningsFromCcu(stat?.totalPlaying ?? 0, now);
              return (
                <EntityCard
                  key={genre.id}
                  color={genreColor(genre.slug)}
                  title={genre.name}
                  href={`/genres/${genre.slug}`}
                  subtitle="Genre"
                  stats={[
                    ["Games", formatCompact(stat?.gameCount ?? 0)],
                    ["Players now", formatCompact(stat?.totalPlaying ?? 0)],
                    [
                      "Players/game",
                      stat && stat.gameCount > 0
                        ? formatCompact(Math.round(stat.totalPlaying / stat.gameCount))
                        : "—",
                    ],
                    ["Visits", formatCompact(stat?.totalVisits ?? 0)],
                    [
                      "Est. earnings/day",
                      <span key="e" className="inline-flex items-center gap-1">
                        {formatUsdRange(earnings.low, earnings.high)}
                        <Badge variant="outline" className="text-[10px]">
                          Est.
                        </Badge>
                      </span>,
                    ],
                    ["Change in range", <GrowthBadge key="g" growth={change?.pct ?? null} />],
                  ]}
                />
              );
            })}
          </div>
        </section>
      )}

      {!empty && (
        <p className="text-xs text-muted-foreground">
          {/* One string: a text chunk after an expression that wraps loses its
              leading space (see the note in /about), and Prettier removes {" "}. */}
          {`Games are collected at different rates (every 3h when busy, about daily when quiet), so lines are drawn between each one’s own readings, and the tooltip shows each one’s latest real reading. Gaps longer than ${SERIES_GAP_DAYS} days are left unconnected. The indexed scale sets each line to 100 at its first reading in the range, so games of very different sizes can be compared as relative change. “Change in range” compares the average over the first ${RISING.avgWindowHours}h of the range with the last ${RISING.avgWindowHours}h, and needs two full windows of readings.`}
        </p>
      )}
    </div>
  );
}

/** Derived stats in the cards get a "?" (Task #112). */
const LABEL_HELP: Partial<Record<string, GlossaryKey>> = {
  "Like ratio": "likeRatio",
  "Est. earnings/day": "earnings",
};

function EntityCard({
  color,
  title,
  href,
  subtitle,
  stats,
  status,
}: {
  color: string;
  title: string;
  href: string;
  subtitle: ReactNode;
  stats: [string, ReactNode][];
  status?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0">
          <Link href={href} className="block truncate font-medium hover:underline">
            {title}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {subtitle}
            {status && <Badge variant="destructive">{status}</Badge>}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {stats.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="whitespace-nowrap text-muted-foreground">
              {LABEL_HELP[label] ? (
                <LabelWithHelp term={LABEL_HELP[label]}>{label}</LabelWithHelp>
              ) : (
                label
              )}
            </dt>
            <dd className="text-right whitespace-nowrap tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
