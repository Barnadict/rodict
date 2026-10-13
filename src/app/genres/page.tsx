import Link from "next/link";
import { cacheLife } from "next/cache";

import { getGenreStats, type GenreStatsSort } from "@/lib/db/genre-stats";
import { getCohortsGlobal } from "@/lib/db/analytics";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { getEngagement, getPassPricing } from "@/lib/cached-queries";
import type { PassPricing } from "@/lib/pass-pricing";
import { formatCompact, formatUsdRange } from "@/lib/format";

import { LabelWithHelp } from "@/components/metric-help";
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
import { CohortTable } from "@/components/data-table/cohort-table";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { PresetLinks } from "@/components/filters/preset-links";
import { GenreDot } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";
import { Rank } from "@/components/rank";
import { ShareBar } from "@/components/share-bar";
import { MobileCards } from "@/components/data-table/mobile-cards";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";
import { SectionHeading } from "@/components/section-heading";
import { EmptyState } from "@/components/empty-state";

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

// Cutoff derived inside from the range key — see the note in /trending. `asOf`
// is returned so the page can price earnings at the as-of date and tell the two
// empty states apart without recomputing it (and re-reading the clock).
async function getGenreRows(range: RangeKey, sort: GenreStatsSort, order: "asc" | "desc") {
  // Remote (Task #98): few distinct keys, so a cold instance reuses another's entry.
  "use cache: remote";
  cacheLife("hours");

  const asOf = rangeToCutoff(range);
  return { rows: await getGenreStats({ asOf, sort, order }), asOf };
}

// Not range-dependent: cohorts compare launch quarters at the latest analytics run.
async function getGlobalCohorts() {
  // Remote (Task #98): few distinct keys, so a cold instance reuses another's entry.
  "use cache: remote";
  cacheLife("hours");
  return getCohortsGlobal();
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

  const [{ rows, asOf }, cohorts, { serverSize }, passPricing] = await Promise.all([
    getGenreRows(range, sort, order),
    getGlobalCohorts(),
    getEngagement(),
    getPassPricing(),
  ]);
  // Pass pricing by genre (Task #89), most-monetized first.
  const passRows = rows
    .flatMap((r) => {
      const p = r.genreId ? passPricing.genres[r.genreId] : undefined;
      return p && p.checkedGames > 0 ? [{ slug: r.slug, name: r.name, p }] : [];
    })
    .sort((a, b) => (b.p.medianPrice ?? -1) - (a.p.medianPrice ?? -1));
  const baseParams = { sort, order, range: range === RANGE_CLEAR_VALUE ? undefined : range };
  const totalGames = rows.reduce((sum, r) => sum + r.gameCount, 0);
  const totalPlaying = rows.reduce((sum, r) => sum + r.totalPlaying, 0);

  return (
    <div className="page-stack">
      <PageHeader
        title="Genres"
        description={`${rows.filter((r) => r.genreId).length} gameplay genres ranked across ${totalGames.toLocaleString("en-US")} tracked games. Click a column to re-rank.`}
      />

      <PresetLinks
        param="range"
        options={RANGE_OPTIONS}
        current={range}
        clearValue={RANGE_CLEAR_VALUE}
      />

      {asOf && rows.length === 0 ? (
        <EmptyState
          title={<>No collected history reaches back that far yet.</>}
          hint={<>Collection started recently. A shorter range has data.</>}
        />
      ) : (
        <>
          <MobileCards
            items={rows.map((row, i) => ({
              key: row.genreId ?? "unclassified",
              href: row.genreId ? `/genres/${row.slug}` : undefined,
              title: (
                <span className="inline-flex items-center gap-2">
                  <GenreDot genre={row.genreId ? row.slug : null} />
                  {row.name}
                </span>
              ),
              rank: i + 1,
              stats: [
                { label: "Games", value: formatCompact(row.gameCount) },
                { label: "Players", value: formatCompact(row.totalPlaying) },
                { label: "Visits", value: formatCompact(row.totalVisits) },
              ],
            }))}
          />
          <div className="hidden overflow-x-auto sm:block xl:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <span className="sr-only">Watch</span>
                  </TableHead>
                  <TableHead className="w-10 text-right">Pos.</TableHead>
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
                  <TableHead className="w-36">Share of players</TableHead>
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
                  <TableHead className="text-right">
                    <LabelWithHelp term="earnings">Est. earnings/day</LabelWithHelp>
                  </TableHead>
                  <TableHead className="text-right" title="Median players per server, now">
                    Typical server
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => {
                  const earnings = estimateDailyEarningsFromCcu(row.totalPlaying, asOf);
                  const share = totalPlaying > 0 ? row.totalPlaying / totalPlaying : 0;
                  return (
                    <TableRow key={row.genreId ?? "unclassified"}>
                      <TableCell>
                        {row.genreId && (
                          <WatchlistButton kind="genre" id={row.slug} name={row.name} size="icon" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Rank value={i + 1} size="sm" />
                      </TableCell>
                      <TableCell className="text-base font-bold">
                        {row.genreId ? (
                          <Link
                            href={`/genres/${row.slug}`}
                            className="inline-flex items-center gap-2 hover:underline"
                          >
                            <GenreDot genre={row.slug} />
                            {row.name}
                          </Link>
                        ) : (
                          <Badge variant="outline">{row.name}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompact(row.gameCount)}
                      </TableCell>
                      <TableCell className="text-right text-lg font-figure">
                        {formatCompact(row.totalPlaying)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <ShareBar value={share} />
                          <span className="w-9 text-right text-[13px] text-muted-foreground">
                            {`${Math.round(share * 100)}%`}
                          </span>
                        </span>
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
                      <TableCell className="text-right tabular-nums">
                        {row.genreId && serverSize[row.genreId]?.median != null ? (
                          <Link href={`/genres/${row.slug}#servers`} className="hover:underline">
                            {formatCompact(serverSize[row.genreId].median!)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <p className="max-w-[75ch] text-[13px] text-muted-foreground">
        {`${rows.length} genre${rows.length === 1 ? "" : "s"} · ${totalGames.toLocaleString("en-US")} game${totalGames === 1 ? "" : "s"} in total.`}{" "}
        Typical server is the median max players per server across the genre&apos;s games right now,
        whatever the range.
      </p>

      {passRows.length > 0 && (
        <section id="passes" className="flex scroll-mt-20 flex-col gap-3">
          <SectionHeading>Game pass pricing by genre</SectionHeading>
          <p className="max-w-[75ch] text-sm text-muted-foreground">
            The passes on sale in each genre&apos;s games, from the{" "}
            {formatCompact(passPricing.all.checkedGames)} games whose pass list we&apos;ve checked
            so far (about once a week each). List prices in Robux, not sales. Highest median price
            first.
          </p>
          <div className="overflow-x-auto xl:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Genre</TableHead>
                  <TableHead className="text-right">Games checked</TableHead>
                  <TableHead className="text-right">With passes</TableHead>
                  <TableHead className="text-right">Passes / game</TableHead>
                  <TableHead className="text-right">Median price</TableHead>
                  <TableHead className="text-right">Middle half</TableHead>
                  <TableHead className="text-right">All passes, median game</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passRows.map((r) => (
                  <PassRow key={r.slug} href={`/genres/${r.slug}#passes`} name={r.name} p={r.p} />
                ))}
                <PassRow name="All genres" p={passPricing.all} />
              </TableBody>
            </Table>
          </div>
          <p className="max-w-[75ch] text-xs text-muted-foreground">
            Passes per game is the median over checked games, counting games with none as 0. The
            last column is the median Robux to buy every pass in a game once, over games with
            passes. Developer products aren&apos;t listed publicly, so they aren&apos;t here.
          </p>
        </section>
      )}

      {cohorts && cohorts.cohorts.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading>Launch cohorts, all genres</SectionHeading>
          <p className="max-w-[75ch] text-sm text-muted-foreground">
            Every classified game grouped by the quarter it launched, as of the latest analytics
            run. Comparing cohorts of different ages at the same moment: older cohorts with fewer
            players today is a cross-sectional decline signal, not a record of each cohort over
            time. {formatCompact(cohorts.nGames)} games with a known launch date.
          </p>
          <div className="max-h-[32rem] overflow-auto border-b xl:[&_thead]:top-0">
            <CohortTable cohorts={cohorts.cohorts} showDetail />
          </div>
        </section>
      )}
    </div>
  );
}

function robux(value: number | null): string {
  return value === null ? "—" : `R$${formatCompact(Math.round(value))}`;
}

function PassRow({ name, href, p }: { name: string; href?: string; p: PassPricing }) {
  return (
    <TableRow className={href ? undefined : "border-t-2 border-rule font-semibold"}>
      <TableCell className="font-bold">
        {href ? (
          <Link href={href} className="hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatCompact(p.checkedGames)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {Math.round((p.gamesWithPasses / p.checkedGames) * 100)}%
      </TableCell>
      <TableCell className="text-right tabular-nums">{p.medianPassesPerGame ?? "—"}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{robux(p.medianPrice)}</TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {p.p25Price !== null
          ? `${robux(p.p25Price)}–${formatCompact(Math.round(p.p75Price!))}`
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">{robux(p.medianTotalRobux)}</TableCell>
    </TableRow>
  );
}
