"use client";

import * as React from "react";
import Link from "next/link";

import { formatCompact } from "@/lib/format";
import { MATRIX_MIN_N, logShade, logShadeDomain } from "@/lib/theme-matrix";
import { cn } from "@/lib/utils";

export interface MatrixAxisItem {
  id: string;
  slug: string;
  name: string;
}

export interface MatrixCellView {
  genreId: string;
  themeId: string;
  n: number;
  medianPlaying: number;
  meanPlaying: number;
  totalPlaying: number;
}

interface Hover {
  genre: MatrixAxisItem;
  theme: MatrixAxisItem;
  cell: MatrixCellView | undefined;
}

/**
 * Genre × theme matrix (Task #64): each cell is the median current players per
 * game among games in that genre with that theme, with n under it. One hue on
 * a log scale; cells under MATRIX_MIN_N games are greyed and don't set the
 * colour range. It shows where games cluster and where they don't, and draws
 * no conclusion from either.
 */
export function GenreThemeMatrix({
  genres,
  themes,
  cells,
}: {
  genres: MatrixAxisItem[];
  themes: MatrixAxisItem[];
  cells: MatrixCellView[];
}) {
  const [hover, setHover] = React.useState<Hover | null>(null);
  const byKey = React.useMemo(
    () => new Map(cells.map((c) => [`${c.genreId}:${c.themeId}`, c])),
    [cells],
  );
  const domain = React.useMemo(
    () => logShadeDomain(cells.filter((c) => c.n >= MATRIX_MIN_N).map((c) => c.medianPlaying)),
    [cells],
  );
  const shade = (v: number) =>
    `color-mix(in oklch, var(--primary) ${Math.round(12 + logShade(v, domain) * 78)}%, var(--background))`;
  const readable = cells.filter((c) => c.n >= MATRIX_MIN_N).length;

  function describe(h: Hover): string {
    const where = `${h.genre.name} × ${h.theme.name}`;
    if (!h.cell) return `${where}: no tracked games`;
    const c = h.cell;
    return `${where}: ${c.n} game${c.n === 1 ? "" : "s"} · median ${formatCompact(
      c.medianPlaying,
    )} players per game · average ${formatCompact(Math.round(c.meanPlaying))} · ${formatCompact(
      c.totalPlaying,
    )} players in total${c.n < MATRIX_MIN_N ? ` · fewer than ${MATRIX_MIN_N} games` : ""}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-[36rem] overflow-auto rounded-lg border">
        <table className="w-max border-separate border-spacing-0.5 text-xs">
          <caption className="sr-only">
            Median current players per game for each genre and theme combination, with the number of
            games. Combinations with fewer than {MATRIX_MIN_N} games are greyed out.
          </caption>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-background p-1.5 text-left font-medium text-muted-foreground">
                Genre \ Theme
              </th>
              {themes.map((t) => (
                <th
                  key={t.id}
                  scope="col"
                  className="sticky top-0 z-10 bg-background p-1.5 text-center font-medium"
                >
                  <Link href={`/themes/${t.slug}`} className="hover:underline">
                    {t.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody onMouseLeave={() => setHover(null)}>
            {genres.map((g) => (
              <tr key={g.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-background p-1.5 text-left font-medium whitespace-nowrap"
                >
                  <Link href={`/genres/${g.slug}`} className="hover:underline">
                    {g.name}
                  </Link>
                </th>
                {themes.map((t) => {
                  const c = byKey.get(`${g.id}:${t.id}`);
                  const small = c !== undefined && c.n < MATRIX_MIN_N;
                  const h = { genre: g, theme: t, cell: c };
                  const active = hover?.genre.id === g.id && hover.theme.id === t.id;
                  // Dark cells take light text so the value stays legible.
                  const dark =
                    c !== undefined && !small && logShade(c.medianPlaying, domain) > 0.55;
                  return (
                    <td
                      key={t.id}
                      tabIndex={0}
                      onMouseEnter={() => setHover(h)}
                      onFocus={() => setHover(h)}
                      title={describe(h)}
                      className={cn(
                        "h-11 min-w-16 rounded-xs px-1.5 text-center align-middle tabular-nums outline-none",
                        !c && "border border-dashed border-border/60 text-muted-foreground/60",
                        small && "bg-muted text-muted-foreground",
                        active && "ring-2 ring-foreground",
                      )}
                      style={c && !small ? { background: shade(c.medianPlaying) } : undefined}
                    >
                      {c ? (
                        <span className="flex flex-col leading-tight">
                          <span
                            className={cn(
                              !small && "font-medium",
                              !small && (dark ? "text-primary-foreground" : "text-foreground"),
                            )}
                          >
                            {formatCompact(c.medianPlaying)}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] opacity-80",
                              dark && "text-primary-foreground",
                            )}
                          >
                            n={c.n}
                          </span>
                        </span>
                      ) : (
                        "·"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {hover ? describe(hover) : "Hover or focus a cell for its numbers."}
        </span>
        {readable > 0 && (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            {formatCompact(10 ** domain[0])}
            <span
              className="h-2 w-16 rounded-sm"
              style={{
                background: `linear-gradient(to right, ${shade(10 ** domain[0])}, ${shade(10 ** domain[1])})`,
              }}
            />
            {formatCompact(10 ** domain[1])} median players/game (log scale)
            <span className="ml-2 inline-block h-2 w-4 rounded-sm bg-muted" /> fewer than{" "}
            {MATRIX_MIN_N} games
          </span>
        )}
      </div>
    </div>
  );
}
