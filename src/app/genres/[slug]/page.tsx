import Link from "next/link";
import { notFound } from "next/navigation";

import { getGenreBySlug } from "@/lib/db/genres";
import { getGenreStatBySlug, getGenreLifecycle } from "@/lib/db/genre-stats";
import { getGenreSnapshots } from "@/lib/db/genre-snapshots";
import { getGamesList } from "@/lib/db/games";
import { getGrowthForGames } from "@/lib/db/trends";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";

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
import { PresetLinks } from "@/components/filters/preset-links";
import { RANGE_OPTIONS, RANGE_CLEAR_VALUE, parseRangeKey, rangeToCutoff } from "@/lib/date-range";

export async function generateMetadata(props: PageProps<"/genres/[slug]">) {
  const { slug } = await props.params;
  const genre = await getGenreBySlug(slug);
  return { title: genre ? `${genre.name} — rodict` : "Genre — rodict" };
}

export default async function GenreDetailPage(props: PageProps<"/genres/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const cutoff = rangeToCutoff(range);

  const genre = await getGenreBySlug(slug);
  if (!genre) notFound();

  const [stat, series, lifecycle, topGames] = await Promise.all([
    getGenreStatBySlug(slug),
    getGenreSnapshots(genre.id, { from: cutoff }),
    getGenreLifecycle(genre.id),
    getGamesList({ genreSlug: slug, sort: "currentPlaying", order: "desc", limit: 10 }),
  ]);

  // A range narrower than "all" adds a Δ column to top games, scoped to just
  // these 10 rows (Task #19) — same pattern as the games list.
  const growthByGame = cutoff
    ? await getGrowthForGames(
        topGames.games.map((g) => g.id),
        cutoff,
      )
    : null;

  const trendData: TrendPoint[] = series.map((s) => ({
    date: s.collectedAt.toISOString(),
    value: s.totalPlaying,
  }));

  const earnings = stat ? estimateDailyEarningsFromCcu(stat.totalPlaying) : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1.5">
        <Link href="/genres" className="text-sm text-muted-foreground hover:text-foreground">
          ← All genres
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{genre.name}</h1>
        {genre.description && <p className="text-muted-foreground">{genre.description}</p>}
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
          <LifecycleChart data={lifecycle} />
        </div>
      </section>

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
