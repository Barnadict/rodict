import Link from "next/link";
import { cacheLife } from "next/cache";

import { getUpdateCadence } from "@/lib/cached-queries";
import { getAllGenres } from "@/lib/db/genres";
import { formatCompact } from "@/lib/format";
import type { GenreCadence } from "@/lib/update-cadence";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTile } from "@/components/data-table/stat-tile";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { LocalTime } from "@/components/local-time";

export const metadata = {
  title: "Update cadence — rodict",
  description:
    "How often Roblox games update, by genre: share updated in the last 30 days, typical days between updates, the most frequently updated games, and how update cadence lines up with player growth.",
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const days = (v: number | null, digits = 0) => (v === null ? "—" : v.toFixed(digits));

/**
 * The genre list must be read inside `use cache` too: during prerender, a
 * query outside a cache scope never resolves, and since the libSQL adapter runs
 * one query at a time, it would stall every other cache fill in the build
 * worker until they time out.
 */
async function getUpdatesPageData() {
  "use cache";
  cacheLife("hours");
  return Promise.all([getUpdateCadence(), getAllGenres()]);
}

export default async function UpdatesPage() {
  const [cadence, genres] = await getUpdatesPageData();
  const genreById = new Map(genres.map((g) => [g.id, g]));
  const { all, recentDays } = cadence;
  const genreRows = cadence.genres
    .flatMap((c) => {
      const g = genreById.get(c.genreId);
      return g ? [{ ...c, slug: g.slug, name: g.name }] : [];
    })
    .sort((a, b) => (b.updatedRecentlyShare ?? -1) - (a.updatedRecentlyShare ?? -1));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Update cadence</h1>
        <p className="max-w-2xl text-muted-foreground">
          How often games change on Roblox, by genre, and which games change most. An
          &ldquo;update&rdquo; is a change in Roblox&apos;s last-updated time: a publish, or some
          settings edits.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={`Updated in the last ${recentDays} days`}
          value={pct(all.updatedRecentlyShare)}
          hint={`Of ${formatCompact(all.games)} tracked games`}
        />
        <StatTile label="Median days since last update" value={days(all.medianDaysSinceUpdate)} />
        <StatTile
          label="Typical days between updates"
          value={days(all.medianDaysBetween, 1)}
          hint={`From ${formatCompact(all.intervalGames)} games with recorded updates`}
        />
        <StatTile
          label={`Updates recorded, last ${recentDays} days`}
          value={formatCompact(all.recentUpdates)}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">By genre</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right">Updated, last {recentDays}d</TableHead>
                <TableHead className="text-right">Median days since</TableHead>
                <TableHead className="text-right">Typical days between</TableHead>
                <TableHead className="text-right">Updates recorded, {recentDays}d</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {genreRows.map((r) => (
                <GenreRow key={r.slug} row={r} />
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          &ldquo;Updated&rdquo; and &ldquo;days since&rdquo; use every game&apos;s current
          last-updated time, so they cover all tracked games. &ldquo;Typical days between&rdquo; is
          the median over games of each game&apos;s own median gap between the updates we recorded
          (so a game updating daily doesn&apos;t outvote the rest). Recording started recently, and
          a game is checked at most once per collection (quiet games once a day), so several updates
          in a day count once and gaps across a collection pause look long: both undercount frequent
          updaters.
          {cadence.trackedSince && (
            <>
              {" "}
              Earliest recorded update in the last 90 days:{" "}
              <LocalTime value={cadence.trackedSince} options={{ dateStyle: "medium" }} />.
            </>
          )}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Most frequently updated · last {recentDays} days</h2>
        {cadence.top.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No updates recorded in the last {recentDays} days yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Game</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead className="text-right">Updates</TableHead>
                  <TableHead className="text-right">Players now</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cadence.top.map((g, i) => {
                  const genre = g.genreId ? genreById.get(g.genreId) : undefined;
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/games/${g.universeId}`} className="hover:underline">
                          {g.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {genre ? (
                          <Link
                            href={`/genres/${genre.slug}#updates`}
                            className="text-muted-foreground hover:underline"
                          >
                            {genre.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {g.updates}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompact(g.currentPlaying)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            Update cadence vs. player change <Badge variant="outline">Associational</Badge>
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Games grouped by how many updates we recorded in the last {recentDays} days, with the
            median change in their daily average players over the same {recentDays} days (the
            Trending rule: first day vs. last day, small games left out). Like the correlations on
            the About page, this shows what goes together, not what causes what: games that are
            growing get more attention from their developers, and live games update more.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Updates, last {recentDays}d</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right">With a player change</TableHead>
                <TableHead className="text-right">Median change</TableHead>
                <TableHead className="text-right">Share that grew</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cadence.buckets.map((b) => (
                <TableRow key={b.label}>
                  <TableCell className="font-medium">{b.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(b.games)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(b.withGrowth)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.medianGrowth !== null ? <GrowthBadge growth={b.medianGrowth} /> : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(b.shareUp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          A group needs 10+ games with a player change to show a median. Collection paused from
          2026-08-20 to 2026-09-29 and update recording is new, so until {recentDays} days of
          collection have built up the change covers a shorter span than {recentDays} days.
        </p>
      </section>
    </div>
  );
}

function GenreRow({ row }: { row: GenreCadence & { slug: string; name: string } }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={`/genres/${row.slug}#updates`} className="hover:underline">
          {row.name}
        </Link>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatCompact(row.games)}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {pct(row.updatedRecentlyShare)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{days(row.medianDaysSinceUpdate)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {days(row.medianDaysBetween, 1)}
        {row.intervalGames > 0 && (
          <span className="ml-1 text-xs text-muted-foreground">
            ({formatCompact(row.intervalGames)})
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatCompact(row.recentUpdates)}</TableCell>
    </TableRow>
  );
}
