import Link from "next/link";

import { getGenreStats, type GenreStatsSort } from "@/lib/db/genre-stats";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PresetLinks } from "@/components/filters/preset-links";
import { RANGE_OPTIONS, RANGE_CLEAR_VALUE, parseRangeKey, rangeToCutoff } from "@/lib/date-range";

export const metadata = { title: "Genres — rodict" };

const SORT_FIELDS: GenreStatsSort[] = [
  "gameCount",
  "totalPlaying",
  "totalVisits",
  "totalFavorites",
];

function isSortField(value: string | undefined): value is GenreStatsSort {
  return SORT_FIELDS.includes(value as GenreStatsSort);
}

export default async function GenresPage(props: PageProps<"/genres">) {
  const sp = await props.searchParams;
  const get = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const sortParam = get("sort");
  const sort: GenreStatsSort = isSortField(sortParam) ? sortParam : "totalPlaying";
  const order = get("order") === "asc" ? "asc" : "desc";
  const range = parseRangeKey(get("range"));
  const asOf = rangeToCutoff(range);

  const rows = await getGenreStats({ asOf, sort, order });
  const baseParams = { sort, order, range: range === RANGE_CLEAR_VALUE ? undefined : range };
  const totalGames = rows.reduce((sum, r) => sum + r.gameCount, 0);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Genres</h1>
        <p className="text-muted-foreground">
          Most played, most games, and estimated earnings by genre.
        </p>
      </div>

      <PresetLinks
        param="range"
        options={RANGE_OPTIONS}
        current={range}
        clearValue={RANGE_CLEAR_VALUE}
      />

      {asOf && rows.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-muted-foreground">
          <p>No collected history reaches back that far yet.</p>
          <p className="text-sm">
            The collector only started recently — this is expected, not a bug.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="gameCount"
                    label="Games"
                    currentSort={sort}
                    currentOrder={order}
                    baseParams={{ range: baseParams.range }}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="totalPlaying"
                    label="Players"
                    currentSort={sort}
                    currentOrder={order}
                    baseParams={{ range: baseParams.range }}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="totalVisits"
                    label="Visits"
                    currentSort={sort}
                    currentOrder={order}
                    baseParams={{ range: baseParams.range }}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="totalFavorites"
                    label="Favorites"
                    currentSort={sort}
                    currentOrder={order}
                    baseParams={{ range: baseParams.range }}
                  />
                </TableHead>
                <TableHead className="text-right">Est. earnings/day</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const earnings = estimateDailyEarningsFromCcu(row.totalPlaying, asOf);
                return (
                  <TableRow key={row.genreId ?? "unclassified"}>
                    <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {row.genreId ? (
                        <Link href={`/genres/${row.slug}`} className="hover:underline">
                          {row.name}
                        </Link>
                      ) : (
                        <Badge variant="outline">{row.name}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(row.gameCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(row.totalPlaying)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(row.totalVisits)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(row.totalFavorites)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {formatUsdRange(earnings.low, earnings.high)}
                        <Badge variant="outline" className="text-[10px]">
                          Est.
                        </Badge>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {rows.length} genre{rows.length === 1 ? "" : "s"} · {totalGames} game
        {totalGames === 1 ? "" : "s"} total
      </p>
    </div>
  );
}
