import Link from "next/link";
import { cacheLife } from "next/cache";

import { getAllThemes, getThemeGameRows } from "@/lib/db/themes";
import { getAllGenres } from "@/lib/db/genres";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";
import { MATRIX_MIN_N, buildGenreThemeMatrix, rollupThemes } from "@/lib/theme-matrix";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GenreThemeMatrix, type MatrixCellView } from "@/components/charts/genre-theme-matrix";

export const metadata = { title: "Themes — rodict" };

/**
 * Every theme's rollup and the genre × theme matrix come from one read of the
 * GameTheme join (Task #64), grouped in memory. Current metrics only: no theme
 * time series is stored, and building one would add writes per collection.
 */
async function getThemesPageData() {
  "use cache";
  cacheLife("hours");

  const [themes, genres, rows] = await Promise.all([
    getAllThemes(),
    getAllGenres(),
    getThemeGameRows(),
  ]);
  const rollup = rollupThemes(rows);
  const matrix = buildGenreThemeMatrix(rows);

  // Priced inside the cache: the page itself has no request data, so reading
  // the clock outside it would block prerendering.
  const now = new Date();
  const themeRows = themes
    .map((t) => {
      const stats = rollup.get(t.id) ?? null;
      return {
        theme: t,
        stats,
        earnings: stats ? estimateDailyEarningsFromCcu(stats.totalPlaying, now) : null,
      };
    })
    .sort((a, b) => (b.stats?.totalPlaying ?? 0) - (a.stats?.totalPlaying ?? 0));

  const cells: MatrixCellView[] = [...matrix].map(([key, c]) => {
    const [genreId, themeId] = key.split(":");
    return { genreId, themeId, ...c };
  });
  // Axes ordered by how many games they hold, so the dense corner reads first.
  const genreN = new Map<string, number>();
  for (const c of cells) genreN.set(c.genreId, (genreN.get(c.genreId) ?? 0) + c.n);
  const matrixGenres = genres
    .map((g) => ({ id: g.id, slug: g.slug, name: g.name }))
    .sort((a, b) => (genreN.get(b.id) ?? 0) - (genreN.get(a.id) ?? 0));
  const matrixThemes = themeRows.map(({ theme }) => ({
    id: theme.id,
    slug: theme.slug,
    name: theme.name,
  }));
  matrixThemes.sort((a, b) => (rollup.get(b.id)?.n ?? 0) - (rollup.get(a.id)?.n ?? 0));

  const themedGames = new Set(rows.map((r) => r.gameId)).size;
  return { themeRows, cells, matrixGenres, matrixThemes, themedGames };
}

export default async function ThemesPage() {
  const { themeRows, cells, matrixGenres, matrixThemes, themedGames } = await getThemesPageData();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Themes</h1>
        <p className="text-muted-foreground">
          The setting of a game (Anime, Fantasy, Space…), tracked separately from its gameplay
          genre. A game can have several themes or none; {formatCompact(themedGames)} tracked games
          have at least one.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Theme</TableHead>
              <TableHead className="text-right">Games</TableHead>
              <TableHead className="text-right">Players now</TableHead>
              <TableHead className="text-right">Median players/game</TableHead>
              <TableHead className="text-right">Visits</TableHead>
              <TableHead className="text-right">Est. earnings/day</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {themeRows.map(({ theme, stats, earnings }, i) => {
              return (
                <TableRow key={theme.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/themes/${theme.slug}`} className="hover:underline">
                      {theme.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(stats?.n ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {stats ? formatCompact(stats.totalPlaying) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {stats ? formatCompact(stats.medianPlaying) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {stats ? formatCompact(stats.totalVisits) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {earnings ? (
                      <span className="inline-flex items-center gap-1.5">
                        {formatUsdRange(earnings.low, earnings.high)}
                        <Badge variant="outline" className="text-[10px]">
                          Est.
                        </Badge>
                      </span>
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
      <p className="text-xs text-muted-foreground">
        A game with two themes counts toward both, so theme totals overlap and don&apos;t add up to
        the site total.
      </p>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">Genre × theme</h2>
          <p className="text-sm text-muted-foreground">
            Each cell is the median of current players per game among tracked games with that genre
            and theme, with the number of games (n) under it. Many games with a low median is a
            crowded combination; few or none is an empty one. Cells with fewer than {MATRIX_MIN_N}{" "}
            games are greyed out because a handful of games says little. This describes what&apos;s
            tracked now; it doesn&apos;t say which combination would do well.
          </p>
        </div>
        {cells.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            No themed games with a genre yet.
          </div>
        ) : (
          <GenreThemeMatrix genres={matrixGenres} themes={matrixThemes} cells={cells} />
        )}
        <p className="text-xs text-muted-foreground">
          Themes are detected from game names and Roblox&apos;s own tags, so a game whose theme
          isn&apos;t in either is missed. Tracked games are the ones discovery has found, not all of
          Roblox.
        </p>
      </section>
    </div>
  );
}
