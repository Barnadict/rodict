import Link from "next/link";

import { getGamesList, type GameSortField } from "@/lib/db/games";
import { getAllGenres } from "@/lib/db/genres";
import { getGrowthForGames } from "@/lib/db/trends";
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
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { PresetLinks } from "@/components/filters/preset-links";
import { RANGE_OPTIONS, RANGE_CLEAR_VALUE, parseRangeKey, rangeToCutoff } from "@/lib/date-range";
import { GamesFilters } from "./_components/games-filters";
import { GamesPagination } from "./_components/games-pagination";

export const metadata = { title: "Games — rodict" };

const SORT_FIELDS: GameSortField[] = [
  "currentPlaying",
  "currentVisits",
  "currentFavorites",
  "allTimePeakPlayers",
  "firstSeenAt",
];

function isSortField(value: string | undefined): value is GameSortField {
  return SORT_FIELDS.includes(value as GameSortField);
}

const PAGE_SIZE = 25;

export default async function GamesPage(props: PageProps<"/games">) {
  const sp = await props.searchParams;
  const get = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const page = Math.max(1, Number(get("page") ?? "1") || 1);
  const sortParam = get("sort");
  const sort: GameSortField = isSortField(sortParam) ? sortParam : "currentPlaying";
  const order = get("order") === "asc" ? "asc" : "desc";
  const genreSlug = get("genre");
  const search = get("q");
  const range = parseRangeKey(get("range"));
  const cutoff = rangeToCutoff(range);

  const [{ games, total }, genres] = await Promise.all([
    getGamesList({
      genreSlug,
      search,
      sort,
      order,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getAllGenres(),
  ]);

  // A range narrower than "all" adds a Δ column, scoped to just this page's
  // rows (Task #19) — no need to rebuild the whole list historically.
  const growthByGame = cutoff
    ? await getGrowthForGames(
        games.map((g) => g.id),
        cutoff,
      )
    : null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = {
    sort,
    order,
    genre: genreSlug,
    q: search,
    range: range === RANGE_CLEAR_VALUE ? undefined : range,
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Games</h1>
        <p className="text-muted-foreground">
          {total.toLocaleString()} tracked game{total === 1 ? "" : "s"} — sortable by players,
          visits, favorites, and estimated earnings.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <GamesFilters genres={genres} />
        <PresetLinks
          param="range"
          options={RANGE_OPTIONS}
          current={range}
          clearValue={RANGE_CLEAR_VALUE}
          baseParams={{ genre: genreSlug, q: search, sort, order }}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Genre</TableHead>
              <TableHead className="text-right">
                <SortableHeader
                  field="currentPlaying"
                  label="Players"
                  currentSort={sort}
                  currentOrder={order}
                  baseParams={{ genre: genreSlug, q: search }}
                />
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader
                  field="currentVisits"
                  label="Visits"
                  currentSort={sort}
                  currentOrder={order}
                  baseParams={{ genre: genreSlug, q: search }}
                />
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader
                  field="currentFavorites"
                  label="Favorites"
                  currentSort={sort}
                  currentOrder={order}
                  baseParams={{ genre: genreSlug, q: search }}
                />
              </TableHead>
              <TableHead className="text-right">Est. earnings/day</TableHead>
              {growthByGame && <TableHead className="text-right">Δ</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {games.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={growthByGame ? 8 : 7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No games match these filters.
                </TableCell>
              </TableRow>
            )}
            {games.map((game, i) => {
              const earnings = estimateDailyEarningsFromCcu(game.currentPlaying);
              const growth = growthByGame?.get(game.id) ?? null;
              return (
                <TableRow key={game.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/games/${game.universeId}`} className="hover:underline">
                      {game.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {game.currentGenre ? (
                      <Badge variant="secondary">{game.currentGenre.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(game.currentPlaying)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(game.currentVisits)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(game.currentFavorites)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {formatUsdRange(earnings.low, earnings.high)}
                      <Badge variant="outline" className="text-[10px]">
                        Est.
                      </Badge>
                    </span>
                  </TableCell>
                  {growthByGame && (
                    <TableCell className="text-right tabular-nums">
                      <GrowthBadge growth={growth?.growthPct ?? null} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <GamesPagination page={page} totalPages={totalPages} baseParams={baseParams} />
    </div>
  );
}
