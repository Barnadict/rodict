import Link from "next/link";
import { cacheLife } from "next/cache";

import { getGamesList, type GameSortField } from "@/lib/db/games";
import { getAllGenres } from "@/lib/db/genres";
import { getAllThemes } from "@/lib/db/themes";
import { getGrowthForGames, RISING } from "@/lib/db/trends";
import { getGrowthById } from "@/lib/cached-queries";
import { getGameIcons } from "@/lib/roblox/client";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";
import { creatorPath } from "@/lib/creators";
import {
  LIKE_RATIO_MIN_VOTES,
  ageToCreatedRange,
  parseAge,
  parseMinPlayers,
  parseStatus,
  type AgeFilter,
  type StatusFilter,
} from "@/lib/games-list";

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
import { ExportLinks } from "@/components/data-table/export-links";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { PresetLinks } from "@/components/filters/preset-links";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";
import { GamesFilters } from "./_components/games-filters";
import { GamesGrid } from "./_components/games-grid";
import { GamesPagination } from "./_components/games-pagination";

export const metadata = { title: "Games — rodict" };

type ViewMode = "table" | "grid";

const VIEW_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "table", label: "Table" },
] as const;

const SORT_FIELDS: GameSortField[] = [
  "currentPlaying",
  "currentVisits",
  "currentFavorites",
  "allTimePeakPlayers",
  "firstSeenAt",
  "likeRatio",
  "growth",
];

function isSortField(value: string | undefined): value is GameSortField {
  return SORT_FIELDS.includes(value as GameSortField);
}

const PAGE_SIZE = 25;

interface GamesQuery {
  page: number;
  sort: GameSortField;
  order: "asc" | "desc";
  genreSlug?: string;
  themeSlug?: string;
  search?: string;
  status?: StatusFilter;
  age?: AgeFilter;
  minPlaying?: number;
  range: RangeKey;
  view: ViewMode;
}

/**
 * The growth lookup is folded in here rather than left in the page body so a
 * cache hit serves the whole table in one shot instead of re-running the Δ
 * query every request.
 *
 * Note the cache key includes the free-text `search`, which is unbounded user
 * input — so search views effectively don't share cache entries. That's
 * acceptable (entries expire within a day, and the default unsearched view is
 * what actually repeats), but it's the reason this stays on in-memory
 * `use cache` rather than paying for a remote cache that search traffic would
 * mostly miss anyway.
 */
async function getGamesPageData(q: GamesQuery) {
  "use cache";
  cacheLife("hours");

  const cutoff = rangeToCutoff(q.range);
  // Growth is range-scoped; the page drops a growth sort when there's no range.
  const growthById = q.sort === "growth" && cutoff ? await getGrowthById(q.range) : undefined;

  const [{ games, total }, genres, themes] = await Promise.all([
    getGamesList({
      genreSlug: q.genreSlug,
      themeSlug: q.themeSlug,
      search: q.search,
      status: q.status,
      minPlaying: q.minPlaying,
      created: q.age ? ageToCreatedRange(q.age, new Date()) : undefined,
      growthById,
      sort: q.sort,
      order: q.order,
      limit: PAGE_SIZE,
      offset: (q.page - 1) * PAGE_SIZE,
    }),
    getAllGenres(),
    getAllThemes(),
  ]);

  // A range narrower than "all" adds a Δ column, scoped to just this page's
  // rows (Task #19) — no need to rebuild the whole list historically. Sorted by
  // growth, the column shows the averaged figure the sort ranked on instead.
  let growthByGame: Map<string, number | null> | null = null;
  if (growthById) {
    growthByGame = new Map(games.map((g) => [g.id, growthById.get(g.id) ?? null]));
  } else if (cutoff) {
    const growth = await getGrowthForGames(
      games.map((g) => g.id),
      cutoff,
    );
    growthByGame = new Map(games.map((g) => [g.id, growth.get(g.id)?.growthPct ?? null]));
  }

  // Icons are a live Roblox API call, so only fetch them for the grid view —
  // the table view stays icon-free and doesn't pay for it. Being inside
  // "use cache" keeps this to one call per page per cache window rather than
  // one per page view.
  let icons: Map<string, string | null> | null = null;
  if (q.view === "grid" && games.length > 0) {
    const fetched = await getGameIcons(games.map((g) => g.universeId));
    icons = new Map(fetched.map((icon) => [String(icon.universeId), icon.imageUrl]));
  }

  return { games, total, genres, themes, growthByGame, icons };
}

export default async function GamesPage(props: PageProps<"/games">) {
  const sp = await props.searchParams;
  const get = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const page = Math.max(1, Number(get("page") ?? "1") || 1);
  const range = parseRangeKey(get("range"));
  const sortParam = get("sort");
  let sort: GameSortField = isSortField(sortParam) ? sortParam : "currentPlaying";
  // Growth is measured over the chosen range; "All" has none to rank by.
  if (sort === "growth" && range === RANGE_CLEAR_VALUE) sort = "currentPlaying";
  const order = get("order") === "asc" ? "asc" : "desc";
  const genreSlug = get("genre");
  const themeSlug = get("theme");
  const search = get("q");
  const status = parseStatus(get("status"));
  const age = parseAge(get("age"));
  const minPlaying = parseMinPlayers(get("min"));
  // Grid is the default landing view (no `view` param) — thumbnail-first
  // browsing is the primary experience; the table is opt-in.
  const view: ViewMode = get("view") === "table" ? "table" : "grid";

  const { games, total, genres, themes, growthByGame, icons } = await getGamesPageData({
    page,
    sort,
    order,
    genreSlug,
    themeSlug,
    search,
    status,
    age,
    minPlaying,
    range,
    view,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // The filters every control carries along; each control adds its own params.
  const filterParams = {
    genre: genreSlug,
    theme: themeSlug,
    q: search,
    status,
    age,
    min: minPlaying?.toString(),
  };
  const rangeParam = range === RANGE_CLEAR_VALUE ? undefined : range;
  const viewParam = view === "grid" ? undefined : view;
  const baseParams = { ...filterParams, sort, order, range: rangeParam, view: viewParam };
  const headerParams = { ...filterParams, range: rangeParam, view: viewParam };

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Games</h1>
        <p className="text-muted-foreground">
          {total.toLocaleString()} tracked game{total === 1 ? "" : "s"} — sortable by players,
          visits, favorites, like ratio and growth.
        </p>
        {sort === "likeRatio" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Sorted by like ratio: only games with at least {LIKE_RATIO_MIN_VOTES} votes are ranked.
          </p>
        )}
        {sort === "growth" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Sorted by growth: average players over the first day of the range vs. the last day, as
            on Trending. Only games averaging at least {RISING.minBaseline} players at the start are
            ranked.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <GamesFilters genres={genres} themes={themes} hasRange={range !== RANGE_CLEAR_VALUE} />
        <div className="flex flex-wrap items-center gap-3">
          <ExportLinks
            dataset="games"
            params={{ ...filterParams, sort, order, range: rangeParam }}
          />
          <PresetLinks
            param="view"
            options={VIEW_OPTIONS}
            current={view}
            clearValue="grid"
            baseParams={{ ...filterParams, sort, order, range: rangeParam }}
          />
          <PresetLinks
            param="range"
            options={RANGE_OPTIONS}
            current={range}
            clearValue={RANGE_CLEAR_VALUE}
            baseParams={{
              ...filterParams,
              // A growth sort only exists within a range; switching drops it.
              sort: sort === "growth" ? undefined : sort,
              order: sort === "growth" ? undefined : order,
              view: viewParam,
            }}
          />
        </div>
      </div>

      {view === "grid" ? (
        <GamesGrid games={games} icons={icons} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">Watch</span>
                </TableHead>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="currentPlaying"
                    label="Players"
                    currentSort={sort}
                    currentOrder={order}
                    baseParams={headerParams}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="currentVisits"
                    label="Visits"
                    currentSort={sort}
                    currentOrder={order}
                    baseParams={headerParams}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="currentFavorites"
                    label="Favorites"
                    currentSort={sort}
                    currentOrder={order}
                    baseParams={headerParams}
                  />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader
                    field="likeRatio"
                    label="Likes"
                    currentSort={sort}
                    currentOrder={order}
                    baseParams={headerParams}
                  />
                </TableHead>
                <TableHead className="text-right">Est. earnings/day</TableHead>
                {growthByGame && (
                  <TableHead className="text-right">
                    <SortableHeader
                      field="growth"
                      label="Δ"
                      currentSort={sort}
                      currentOrder={order}
                      baseParams={headerParams}
                    />
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={growthByGame ? 10 : 9}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No games match these filters.
                  </TableCell>
                </TableRow>
              )}
              {games.map((game, i) => {
                const earnings = estimateDailyEarningsFromCcu(
                  game.currentPlaying,
                  undefined,
                  game.passCatalog,
                );
                const growth = growthByGame?.get(game.id) ?? null;
                const votes = game.currentUpVotes + game.currentDownVotes;
                return (
                  <TableRow key={game.id}>
                    <TableCell>
                      <WatchlistButton
                        kind="game"
                        id={game.universeId.toString()}
                        name={game.name}
                        size="icon"
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/games/${game.universeId}`} className="hover:underline">
                        {game.name}
                      </Link>
                      {game.creatorName && <CreatorLine game={game} />}
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
                      {votes > 0 ? `${Math.round((game.currentUpVotes / votes) * 100)}%` : "—"}
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
                        <GrowthBadge growth={growth} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <GamesPagination page={page} totalPages={totalPages} baseParams={baseParams} />
    </div>
  );
}

/** "by <creator>" under a game's name, linking to their creator page. */
function CreatorLine({
  game,
}: {
  game: { creatorId: bigint | null; creatorType: string | null; creatorName: string | null };
}) {
  const href = creatorPath(game.creatorId, game.creatorType);
  return (
    <div className="text-xs font-normal text-muted-foreground">
      by{" "}
      {href ? (
        <Link href={href} className="hover:text-foreground hover:underline">
          {game.creatorName}
        </Link>
      ) : (
        game.creatorName
      )}
    </div>
  );
}
