import Link from "next/link";
import { cacheLife } from "next/cache";

import { getEarlyReadings, getGenreEarlyLifecycle, getNewReleases } from "@/lib/db/new-releases";
import { getLastDiscoveryRun } from "@/lib/db/job-runs";
import { formatCompact, formatRelativeTime } from "@/lib/format";
import {
  EARLY_CURVE_DAYS,
  LIFECYCLE_MIN_GAMES,
  NEW_RELEASE_DAYS,
  NEW_RELEASES_LIMIT,
  dailyByAge,
  parseNewReleaseSort,
  releaseKind,
  sortNewReleases,
  weekOverWeek,
} from "@/lib/new-releases";

import { Badge } from "@/components/ui/badge";
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
import { StatTile } from "@/components/data-table/stat-tile";
import { LocalTime } from "@/components/local-time";
import { EarlyCurveChart } from "@/components/charts/early-curve-chart";

export const metadata = { title: "New releases — rodict" };

const DAY_MS = 86_400_000;

const SORT_OPTIONS = [
  { value: "players", label: "Players now" },
  { value: "growth", label: "7-day change" },
] as const;

/**
 * The list, independent of sort (sorted on render). The clock is read inside
 * so the cache key stays constant; see the note in /trending.
 */
async function getNewReleasesData() {
  "use cache";
  cacheLife("hours");

  const now = new Date();
  const cutoff = new Date(now.getTime() - NEW_RELEASE_DAYS * DAY_MS);
  const [{ games, total }, discovery] = await Promise.all([
    getNewReleases(cutoff, now),
    getLastDiscoveryRun(),
  ]);
  const rows = games.map(({ recent, ...g }) => ({
    ...g,
    kind: releaseKind(g.robloxCreatedAt, cutoff),
    change: weekOverWeek(recent),
  }));
  return { rows, total, discovery };
}

/** One game's early curve and its genre's band, cached per game. */
async function getEarlyCurve(gameId: string, genreId: string | null, createdAt: Date) {
  "use cache";
  cacheLife("hours");

  const [readings, genre] = await Promise.all([
    getEarlyReadings(gameId, createdAt, EARLY_CURVE_DAYS),
    genreId ? getGenreEarlyLifecycle(genreId, EARLY_CURVE_DAYS, gameId) : Promise.resolve([]),
  ]);
  return { game: dailyByAge(readings, createdAt, EARLY_CURVE_DAYS), genre };
}

export default async function NewReleasesPage(props: PageProps<"/new">) {
  const sp = await props.searchParams;
  const get = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const sort = parseNewReleaseSort(get("sort"));
  const { rows, total, discovery } = await getNewReleasesData();
  const sorted = sortNewReleases(rows, sort);

  // The chart shows the chosen game, or the most-played one that's new on
  // Roblox (an older, newly tracked game has no early days to draw).
  const chartable = rows.filter((r) => r.kind === "new-on-roblox" && r.robloxCreatedAt);
  const chosen =
    chartable.find((r) => r.universeId.toString() === get("game")) ??
    rows.find((r) => r.universeId.toString() === get("game")) ??
    chartable[0];
  const curve =
    chosen && chosen.kind === "new-on-roblox" && chosen.robloxCreatedAt
      ? await getEarlyCurve(chosen.id, chosen.currentGenreId, chosen.robloxCreatedAt)
      : null;

  // Past the searchParams await the page renders per request, so the clock
  // here isn't baked into a prerender.
  const now = new Date();
  const newOnRoblox = rows.filter((r) => r.kind === "new-on-roblox").length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New releases</h1>
        <p className="text-muted-foreground">
          Games created on Roblox or first tracked here in the last {NEW_RELEASE_DAYS} days, and how
          their first days compare with others in their genre.
        </p>
      </div>

      <div className="rounded-lg border p-3 text-sm">
        <p>
          <span className="font-medium">
            Discovery last ran{" "}
            {discovery ? (
              <>
                <LocalTime value={discovery.startedAt} />{" "}
                <span className="font-normal text-muted-foreground">
                  ({formatRelativeTime(discovery.startedAt, now)}
                  {discovery.newGames !== null &&
                    `, ${formatCompact(discovery.newGames)} new game${discovery.newGames === 1 ? "" : "s"}`}
                  )
                </span>
              </>
            ) : (
              <span className="font-normal text-muted-foreground">— no run recorded</span>
            )}
          </span>
        </p>
        <p className="mt-1 text-muted-foreground">
          New games only enter the data through discovery, which searches Roblox and its charts.
          Scheduled collection only follows games already tracked, so a game released since the last
          discovery run won&apos;t be here yet.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="New on Roblox" value={formatCompact(newOnRoblox)} />
        <StatTile label="Newly tracked" value={formatCompact(rows.length - newOnRoblox)} />
        <StatTile
          label="Playing now"
          value={formatCompact(rows.reduce((s, r) => s + r.currentPlaying, 0))}
        />
      </div>

      {chosen && (
        <section id="curve" className="flex scroll-mt-4 flex-col gap-3">
          <div>
            <h2 className="font-medium">
              Early curve:{" "}
              <Link href={`/games/${chosen.universeId}`} className="hover:underline">
                {chosen.name}
              </Link>
            </h2>
            <p className="text-sm text-muted-foreground">
              Daily average players by day since the game was created on Roblox, over the median and
              middle half of other {chosen.currentGenre ? chosen.currentGenre.name : "same-genre"}{" "}
              games at the same age. Pick another game with &ldquo;Curve&rdquo; in the table.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            {curve ? (
              <EarlyCurveChart
                game={curve.game}
                genre={curve.genre}
                gameName={chosen.name}
                genreName={chosen.currentGenre?.name ?? "Genre"}
                maxDays={EARLY_CURVE_DAYS}
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-center text-muted-foreground">
                {chosen.name} was created on Roblox long before we started tracking it, so there are
                no early days to draw.
              </div>
            )}
          </div>
          {curve && (
            <p className="text-xs text-muted-foreground">
              {curve.genre.length === 0
                ? chosen.currentGenre
                  ? `Not enough ${chosen.currentGenre.name} games were tracked from launch to draw a genre band yet (it needs ${LIFECYCLE_MIN_GAMES}+ games at a given age). Only games created after collection began can have readings from their first days, so this fills in over time.`
                  : "This game has no genre, so there's no genre band to compare with."
                : `The band only includes games we tracked at that age, and a day is drawn only when ${LIFECYCLE_MIN_GAMES}+ games have a reading. Games discovery found early are more likely to be ones that took off, so the band may run high.`}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            {total > rows.length
              ? `Top ${rows.length} of ${formatCompact(total)} by players`
              : `${rows.length} game${rows.length === 1 ? "" : "s"}`}
          </h2>
          <PresetLinks
            param="sort"
            options={SORT_OPTIONS}
            current={sort}
            clearValue="players"
            baseParams={{ game: get("game") }}
          />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="text-right">First tracked</TableHead>
                <TableHead className="text-right">Players now</TableHead>
                <TableHead className="text-right">7-day change</TableHead>
                <TableHead>
                  <span className="sr-only">Early curve</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No games created or first tracked in the last {NEW_RELEASE_DAYS} days.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((g, i) => (
                <TableRow key={g.id} className={g.id === chosen?.id ? "bg-muted/50" : undefined}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/games/${g.universeId}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>
                      {g.kind === "new-on-roblox" ? (
                        <Badge variant="secondary">New on Roblox</Badge>
                      ) : (
                        <Badge variant="outline">Newly tracked</Badge>
                      )}
                      {g.status === "dead" && <Badge variant="destructive">Dead</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {g.currentGenre ? (
                      <Link href={`/genres/${g.currentGenre.slug}`} className="hover:underline">
                        {g.currentGenre.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                    {g.robloxCreatedAt ? formatRelativeTime(g.robloxCreatedAt, now) : "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                    {formatRelativeTime(g.firstSeenAt, now)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(g.currentPlaying)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <GrowthBadge growth={g.change?.pct ?? null} />
                  </TableCell>
                  <TableCell>
                    {g.kind === "new-on-roblox" && (
                      <Link
                        href={`?${new URLSearchParams({
                          ...(sort === "players" ? {} : { sort }),
                          game: g.universeId.toString(),
                        })}#curve`}
                        scroll={false}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        Curve
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          {/* One string: a text chunk after an expression that wraps loses its
              leading space (see the note in /about), and Prettier removes {" "}. */}
          {`Lists the ${NEW_RELEASES_LIMIT} most-played new games at most; sorting by change reorders those. 7-day change compares average players in the 24h up to each game’s latest reading with the same 24h a week earlier, and shows “—” for a game without readings a week back. “Newly tracked” games are older games that discovery only just found.`}
        </p>
      </section>
    </div>
  );
}
