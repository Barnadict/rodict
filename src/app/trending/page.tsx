import Link from "next/link";

import { getRisingGames, getRisingGenres } from "@/lib/db/trends";
import { formatCompact } from "@/lib/format";

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
import { RANGE_OPTIONS, RANGE_CLEAR_VALUE, parseRangeKey, rangeToCutoff } from "@/lib/date-range";

export const metadata = { title: "Trending — rodict" };

export default async function TrendingPage(props: PageProps<"/trending">) {
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const cutoff = rangeToCutoff(range);

  const [games, genres] = await Promise.all([
    getRisingGames({ cutoff, limit: 25 }),
    getRisingGenres({ cutoff, limit: 25 }),
  ]);

  const hasData = games.length > 0 || genres.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trending</h1>
        <p className="text-muted-foreground">
          Fastest-growing games and genres by concurrent players over the selected window.
        </p>
      </div>

      <PresetLinks
        param="range"
        options={RANGE_OPTIONS}
        current={range}
        clearValue={RANGE_CLEAR_VALUE}
      />

      {!hasData ? (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-muted-foreground">
          <p>Not enough history in this window to compute growth yet.</p>
          <p className="text-sm">
            Growth needs at least two snapshots per game/genre — this fills in as the collector
            runs. Expected during cold start.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="font-medium">Rising games</h2>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead className="text-right">Players</TableHead>
                    <TableHead className="text-right">Growth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {games.map((g, i) => (
                    <TableRow key={g.id}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/games/${g.universeId}`} className="hover:underline">
                          {g.name}
                        </Link>
                        {g.genreName && (
                          <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                            {g.genreName}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompact(g.currentPlaying)}
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
            <h2 className="font-medium">Rising genres</h2>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Genre</TableHead>
                    <TableHead className="text-right">Players</TableHead>
                    <TableHead className="text-right">Growth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {genres.map((g, i) => (
                    <TableRow key={g.id}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/genres/${g.slug}`} className="hover:underline">
                          {g.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompact(g.currentPlaying)}
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

      <p className="text-sm text-muted-foreground">
        Growth is measured across the snapshots collected within the window. With limited early
        history it reflects change over whatever period we have — it grows more meaningful as data
        accumulates.
      </p>
    </div>
  );
}
