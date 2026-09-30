import Link from "next/link";
import { cacheLife } from "next/cache";

import { getDeadGames } from "@/lib/db/graveyard";
import { formatCompact } from "@/lib/format";
import {
  GRAVEYARD_LIMIT,
  GRAVE_SORTS,
  graveStats,
  parseGraveSort,
  sortGraves,
  summarizeGraves,
} from "@/lib/graveyard";
import { formatDays } from "@/lib/records";

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
import { StatTile } from "@/components/data-table/stat-tile";
import { LocalTime } from "@/components/local-time";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Graveyard — rodict",
  description:
    "Roblox games that died by rodict's rule (under 5% of their peak for 7+ days): their peak, lifespan, genre and how fast they fell.",
};

/** Every grave with its lifespan figures, independent of filter and sort. */
async function getGraveyard() {
  "use cache";
  cacheLife("hours");
  const rows = await getDeadGames();
  return rows.map((r) => ({ ...r, ...graveStats(r) }));
}

const fmtDays = (days: number | null) => (days === null ? "—" : formatDays(days));

export default async function GraveyardPage(props: PageProps<"/graveyard">) {
  const sp = await props.searchParams;
  const get = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const sort = parseGraveSort(get("sort"));
  const all = await getGraveyard();

  // Genre chips: only genres that have graves, most graves first.
  const genreCounts = new Map<string, { slug: string; name: string; count: number }>();
  for (const g of all) {
    if (!g.currentGenre) continue;
    const entry = genreCounts.get(g.currentGenre.slug) ?? { ...g.currentGenre, count: 0 };
    entry.count++;
    genreCounts.set(g.currentGenre.slug, entry);
  }
  const genres = [...genreCounts.values()].sort((a, b) => b.count - a.count);
  const genre = genres.find((g) => g.slug === get("genre")) ?? null;

  const filtered = genre ? all.filter((g) => g.currentGenre?.slug === genre.slug) : all;
  const summary = summarizeGraves(filtered);
  const rows = sortGraves(filtered, sort).slice(0, GRAVEYARD_LIMIT);
  const sortParam = sort === "recent" ? undefined : sort;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Graveyard</h1>
        <p className="text-muted-foreground">
          Games that are dead by our rule: below 5% of their own all-time peak for 7+ days in a row,
          still true at their latest reading. They&apos;re still online and playable; the rule is
          ours, not Roblox&apos;s. A game that recovers leaves the graveyard.{" "}
          <Link href="/about#definitions" className="underline underline-offset-2">
            The dead rule
          </Link>{" "}
          ·{" "}
          {genre ? (
            <Link href={`/genres/${genre.slug}#survival`} className="underline underline-offset-2">
              {genre.name} survival curve
            </Link>
          ) : (
            <span>each genre&apos;s survival curve is on its genre page</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label={genre ? `Dead ${genre.name} games` : "Dead games"}
          value={formatCompact(summary.count)}
        />
        <StatTile
          label="Median lifespan"
          value={fmtDays(summary.medianLifespanDays)}
          hint="Roblox creation → death"
        />
        <StatTile
          label="Median peak → death"
          value={fmtDays(summary.medianPeakToDeathDays)}
          hint="From the peak we observed"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <GenreChip href={sortParam ? `?sort=${sortParam}` : "?"} active={!genre}>
            All · {formatCompact(all.length)}
          </GenreChip>
          {genres.map((g) => {
            const params = new URLSearchParams({ genre: g.slug });
            if (sortParam) params.set("sort", sortParam);
            return (
              <GenreChip key={g.slug} href={`?${params}`} active={genre?.slug === g.slug}>
                {g.name} · {formatCompact(g.count)}
              </GenreChip>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            {filtered.length > rows.length
              ? `${rows.length} of ${formatCompact(filtered.length)}`
              : `${rows.length} game${rows.length === 1 ? "" : "s"}`}
          </h2>
          <PresetLinks
            param="sort"
            options={GRAVE_SORTS}
            current={sort}
            clearValue="recent"
            baseParams={{ genre: genre?.slug }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Game</TableHead>
              <TableHead>Genre</TableHead>
              <TableHead className="text-right">Peak</TableHead>
              <TableHead className="text-right">Players now</TableHead>
              <TableHead className="text-right">Lifespan</TableHead>
              <TableHead className="text-right">Peak → death</TableHead>
              <TableHead className="text-right">Died</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No dead games {genre ? `in ${genre.name} ` : ""}yet. A game needs 7+ days below 5%
                  of its peak, so this fills in as games are followed.
                </TableCell>
              </TableRow>
            )}
            {rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">
                  <Link href={`/games/${g.universeId}`} className="hover:underline">
                    {g.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {g.currentGenre ? (
                    <Link
                      href={`/genres/${g.currentGenre.slug}#survival`}
                      className="hover:underline"
                    >
                      {g.currentGenre.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCompact(g.allTimePeakPlayers)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatCompact(g.currentPlaying)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtDays(g.lifespanDays)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtDays(g.peakToDeathDays)}
                </TableCell>
                <TableCell className="text-right">
                  <LocalTime value={g.deadSince} options={{ dateStyle: "medium" }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Died is when the final stretch below 5% of peak began. Peaks only cover the time since we
        started tracking a game, so an older game&apos;s launch peak, and the true time from it, can
        be missed. Lifespan needs the Roblox creation date.
      </p>
    </div>
  );
}

function GenreChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant={active ? "default" : "outline"}
      className={cn("tabular-nums", !active && "text-muted-foreground hover:text-foreground")}
      render={<Link href={href} scroll={false} />}
    >
      {children}
    </Badge>
  );
}
