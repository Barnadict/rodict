import Link from "next/link";
import { cacheLife } from "next/cache";

import { RISING, getRisingGames, getRisingGenres } from "@/lib/db/trends";
import { getRecentAnomalies } from "@/lib/db/analytics";
import { getUniverseIds } from "@/lib/db/games";
import { formatCompact } from "@/lib/format";
import { getSmallIcons } from "@/lib/game-icons";
import { getGameSparklines, getGenreSparklines } from "@/lib/db/sparklines";
import { SPARK_DAYS } from "@/lib/sparkline";
import { formatGrowthPct } from "@/lib/stats";

import { Badge } from "@/components/ui/badge";
import { GenreBadge, GenreDot } from "@/components/genre-badge";
import { GameIcon } from "@/components/game-icon";
import { Sparkline } from "@/components/sparkline";
import { PageHeader } from "@/components/page-header";
import { MobileCards } from "@/components/data-table/mobile-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PresetLinks } from "@/components/filters/preset-links";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { ExportLinks } from "@/components/data-table/export-links";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";

export const metadata = { title: "Trending — rodict" };

/** Flagged changes listed under the boards. */
const RECENT_SHOWN = 12;

/**
 * Keyed on the range KEY, not the cutoff Date — deriving the cutoff inside is
 * what makes this cacheable at all. A `Date` computed from `now` and passed in
 * as an argument would be a new cache key on every request, so the cache would
 * never hit and the work would be repeated behind a cache that only ever grew.
 */
async function getTrendingData(range: RangeKey) {
  // Remote (Task #98): few distinct keys, so a cold instance reuses another's entry.
  "use cache: remote";
  cacheLife("hours");

  const cutoff = rangeToCutoff(range);
  const [games, genres, anomalies] = await Promise.all([
    getRisingGames({ cutoff, limit: 25 }),
    getRisingGenres({ cutoff, limit: 25 }),
    getRecentAnomalies(),
  ]);

  // Anomalies are keyed by Game.id; game pages by universe id.
  const recent = anomalies?.recent.slice(0, RECENT_SHOWN) ?? [];
  // Thumbnails (Task #103) and 7-day sparklines (Task #102) for the listed rows only.
  const [universe, icons, gameSparks, genreSparks] = await Promise.all([
    getUniverseIds(recent.filter((a) => a.scope === "game").map((a) => a.id)),
    getSmallIcons(games.map((g) => g.universeId)),
    getGameSparklines(games.map((g) => g.id)),
    getGenreSparklines(genres.map((g) => g.id)),
  ]);
  return {
    games: games.map((g) => ({
      ...g,
      icon: icons.get(String(g.universeId)) ?? null,
      spark: gameSparks[g.id] ?? [],
    })),
    genres: genres.map((g) => ({ ...g, spark: genreSparks[g.id] ?? [] })),
    recent: recent.map((a) => ({
      ...a,
      universeId: a.scope === "game" ? (universe[a.id] ?? null) : null,
    })),
  };
}

export default async function TrendingPage(props: PageProps<"/trending">) {
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const { games, genres, recent } = await getTrendingData(range);

  const hasData = games.length > 0 || genres.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Trending"
        description="Fastest-growing games and genres by average concurrent players over the selected window."
      />

      <PresetLinks
        param="range"
        options={RANGE_OPTIONS}
        current={range}
        clearValue={RANGE_CLEAR_VALUE}
      />

      {!hasData ? (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-muted-foreground">
          <p>Nothing has grown in this window yet, or there isn&apos;t enough history.</p>
          <p className="text-sm">
            Growth needs {(2 * RISING.avgWindowHours) / 24} days of history in the window and a
            starting average of at least {RISING.minBaseline} players — this fills in as the
            collector runs.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Rising games</h2>
              <ExportLinks dataset="trending" params={{ kind: "games", range }} />
            </div>
            <MobileCards
              items={games.map((g, i) => ({
                key: g.id,
                href: `/games/${g.universeId}`,
                title: g.name,
                icon: g.icon,
                rank: i + 1,
                subtitle: g.genreName ? <GenreBadge name={g.genreName} /> : undefined,
                stats: [
                  {
                    label: "Avg players",
                    value: `${formatCompact(Math.round(g.basePlaying))} → ${formatCompact(Math.round(g.currentPlaying))}`,
                  },
                  { label: "Growth", value: <GrowthBadge growth={g.growthPct} /> },
                ],
                aside: <Sparkline values={g.spark} width={64} />,
              }))}
            />
            <div className="hidden overflow-x-auto rounded-lg border sm:block xl:overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>Last {SPARK_DAYS}d</TableHead>
                    <TableHead className="text-right">Avg players</TableHead>
                    <TableHead className="text-right">Growth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {games.map((g, i) => (
                    <TableRow key={g.id}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="min-w-44 font-medium whitespace-normal">
                        <div className="flex items-center gap-2.5">
                          <GameIcon src={g.icon} />
                          <div className="flex min-w-0 flex-col items-start gap-0.5">
                            <Link href={`/games/${g.universeId}`} className="hover:underline">
                              {g.name}
                            </Link>
                            {g.genreName && <GenreBadge name={g.genreName} />}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Sparkline values={g.spark} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-muted-foreground">
                          {formatCompact(Math.round(g.basePlaying))} →
                        </span>{" "}
                        {formatCompact(Math.round(g.currentPlaying))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GrowthBadge growth={g.growthPct} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Rising genres</h2>
              <ExportLinks dataset="trending" params={{ kind: "genres", range }} />
            </div>
            <MobileCards
              items={genres.map((g, i) => ({
                key: g.id,
                href: `/genres/${g.slug}`,
                title: (
                  <span className="inline-flex items-center gap-1.5">
                    <GenreDot genre={g.slug} /> {g.name}
                  </span>
                ),
                rank: i + 1,
                stats: [
                  {
                    label: "Avg players",
                    value: `${formatCompact(Math.round(g.basePlaying))} → ${formatCompact(Math.round(g.currentPlaying))}`,
                  },
                  { label: "Growth", value: <GrowthBadge growth={g.growthPct} /> },
                ],
                aside: <Sparkline values={g.spark} width={64} />,
              }))}
            />
            <div className="hidden overflow-x-auto rounded-lg border sm:block xl:overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Genre</TableHead>
                    <TableHead>Last {SPARK_DAYS}d</TableHead>
                    <TableHead className="text-right">Avg players</TableHead>
                    <TableHead className="text-right">Growth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {genres.map((g, i) => (
                    <TableRow key={g.id}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <GenreDot genre={g.slug} />
                          <Link href={`/genres/${g.slug}`} className="hover:underline">
                            {g.name}
                          </Link>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Sparkline values={g.spark} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-muted-foreground">
                          {formatCompact(Math.round(g.basePlaying))} →
                        </span>{" "}
                        {formatCompact(Math.round(g.currentPlaying))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <GrowthBadge growth={g.growthPct} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-medium">Recent notable changes</h2>
            <p className="text-sm text-muted-foreground">
              Auto-detected spikes and drops — moves that are both large relative to each
              series&apos; own typical step and substantial in their own right (change-point
              detection).
            </p>
          </div>
          <div className="flex flex-col divide-y rounded-lg border">
            {recent.map((a, i) => (
              <div
                key={`${a.id}-${a.at}-${i}`}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {a.scope}
                  </Badge>
                  {a.universeId ? (
                    <Link
                      href={`/games/${a.universeId}`}
                      className="truncate font-medium hover:underline"
                    >
                      {a.name}
                    </Link>
                  ) : (
                    <span className="truncate font-medium">{a.name}</span>
                  )}
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

      <p className="text-sm text-muted-foreground">
        Growth compares average concurrent players over the first {RISING.avgWindowHours}h of the
        window with the last {RISING.avgWindowHours}h, so a game&apos;s daily peak-and-trough cycle
        doesn&apos;t count as growth. Only games and genres averaging at least {RISING.minBaseline}{" "}
        players at the start are ranked, which keeps a jump from 2 to 40 players off the list. With
        &ldquo;All&rdquo;, the start is the first day we collected.
      </p>
    </div>
  );
}
