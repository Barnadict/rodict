import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";

import { getThemeBySlug, getThemeGameRows } from "@/lib/db/themes";
import { getAllGenres } from "@/lib/db/genres";
import { getGamesList } from "@/lib/db/games";
import { getSmallIcons } from "@/lib/game-icons";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";
import { MATRIX_MIN_N, buildGenreThemeMatrix, matrixKey, rollupThemes } from "@/lib/theme-matrix";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTile } from "@/components/data-table/stat-tile";
import { MobileCards } from "@/components/data-table/mobile-cards";
import { GameIcon } from "@/components/game-icon";
import { GenreBadge, GenreDot } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";
import { THEMES } from "@/lib/taxonomy/themes";

/** Every theme is built at deploy (Task #96); the list is the fixed taxonomy. */
export function generateStaticParams() {
  return THEMES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata(props: PageProps<"/themes/[slug]">) {
  const { slug } = await props.params;
  const theme = await getThemeBySlug(slug);
  return { title: theme ? `${theme.name} — rodict` : "Theme — rodict" };
}

const TOP_GAMES = 25;

/** Returns null for an unknown slug; see the note on getGenreDetail. */
async function getThemeDetail(slug: string) {
  "use cache";
  cacheLife("hours");

  const theme = await getThemeBySlug(slug);
  if (!theme) return null;

  const [rows, genres, top] = await Promise.all([
    getThemeGameRows(theme.id),
    getAllGenres(),
    getGamesList({ themeSlug: slug, sort: "currentPlaying", order: "desc", limit: TOP_GAMES }),
  ]);
  const stats = rollupThemes(rows).get(theme.id) ?? null;
  const matrix = buildGenreThemeMatrix(rows);
  const byGenre = genres
    .map((g) => ({ genre: g, cell: matrix.get(matrixKey(g.id, theme.id)) ?? null }))
    .filter((r) => r.cell !== null)
    .sort((a, b) => b.cell!.n - a.cell!.n);
  const unclassified = rows.filter((r) => r.genreId === null).length;
  const icons = Object.fromEntries(await getSmallIcons(top.games.map((g) => g.universeId)));

  // Priced inside the cache, like the genre page, so no clock read on render.
  const earnings = stats ? estimateDailyEarningsFromCcu(stats.totalPlaying, new Date()) : null;
  return { theme, stats, byGenre, unclassified, top, earnings, icons };
}

export default async function ThemeDetailPage(props: PageProps<"/themes/[slug]">) {
  const { slug } = await props.params;
  const data = await getThemeDetail(slug);
  if (!data) notFound();
  const { theme, stats, byGenre, unclassified, top, earnings, icons } = data;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        breadcrumbs={[{ label: "Themes", href: "/themes" }]}
        title={theme.name}
        description={`Tracked games with the ${theme.name} theme, across every genre.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Games" value={formatCompact(stats?.n ?? 0)} />
        <StatTile label="Players now" value={formatCompact(stats?.totalPlaying ?? 0)} />
        <StatTile
          label="Median players/game"
          value={stats ? formatCompact(stats.medianPlaying) : "—"}
        />
        <StatTile
          label="Est. earnings/day"
          value={earnings ? formatUsdRange(earnings.low, earnings.high) : "—"}
          badge="Est."
        />
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">By genre</h2>
          <p className="text-sm text-muted-foreground">
            This theme&apos;s games split by gameplay genre, most games first. Rows with fewer than{" "}
            {MATRIX_MIN_N} games are greyed out.
            {unclassified > 0 &&
              ` ${unclassified} game${unclassified === 1 ? " has" : "s have"} no genre and aren't listed.`}
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border xl:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right">Median players/game</TableHead>
                <TableHead className="text-right">Players now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byGenre.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    No games with this theme have a genre yet.
                  </TableCell>
                </TableRow>
              )}
              {byGenre.map(({ genre, cell }) => (
                <TableRow
                  key={genre.id}
                  className={cell!.n < MATRIX_MIN_N ? "text-muted-foreground" : undefined}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/genres/${genre.slug}`}
                      className="inline-flex items-center gap-2 hover:underline"
                    >
                      <GenreDot genre={genre.slug} />
                      {genre.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{cell!.n}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(cell!.medianPlaying)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(cell!.totalPlaying)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Top games</h2>
          <Link
            href={`/games?theme=${theme.slug}&view=table`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            All {formatCompact(top.total)} in Games →
          </Link>
        </div>
        <MobileCards
          empty="No games tracked with this theme yet."
          items={top.games.map((game, i) => ({
            key: game.id,
            href: `/games/${game.universeId}`,
            title: game.name,
            icon: icons[String(game.universeId)] ?? null,
            rank: i + 1,
            subtitle: game.currentGenre ? (
              <GenreBadge name={game.currentGenre.name} slug={game.currentGenre.slug} />
            ) : undefined,
            stats: [
              { label: "Players", value: formatCompact(game.currentPlaying) },
              { label: "Visits", value: formatCompact(game.currentVisits) },
            ],
          }))}
        />
        <div className="hidden overflow-x-auto rounded-lg border sm:block xl:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Visits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.games.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No games tracked with this theme yet.
                  </TableCell>
                </TableRow>
              )}
              {top.games.map((game, i) => (
                <TableRow key={game.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="min-w-48 font-medium whitespace-normal">
                    <span className="flex items-center gap-2.5">
                      <GameIcon src={icons[String(game.universeId)]} />
                      <Link href={`/games/${game.universeId}`} className="hover:underline">
                        {game.name}
                      </Link>
                    </span>
                  </TableCell>
                  <TableCell>
                    {game.currentGenre ? (
                      <GenreBadge name={game.currentGenre.name} slug={game.currentGenre.slug} />
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
