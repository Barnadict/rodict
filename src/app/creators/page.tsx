import Link from "next/link";
import { cacheLife } from "next/cache";

import { getCreatorLeaderboard } from "@/lib/db/creators";
import {
  CREATORS_LIMIT,
  CREATOR_SORTS,
  HIT_PEAK_PLAYERS,
  HIT_RATE_MIN_GAMES,
  creatorPath,
  hitRate,
  parseCreatorSort,
  rankCreators,
} from "@/lib/creators";
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
import { StatTile } from "@/components/data-table/stat-tile";

export const metadata = {
  title: "Creators — rodict",
  description:
    "Roblox studios and developers ranked by players now, games tracked, active games, hits and hit rate.",
};

/** Every creator, unsorted; each sort re-ranks this one cached read. */
async function getCreators() {
  "use cache";
  cacheLife("hours");
  return getCreatorLeaderboard();
}

export default async function CreatorsPage(props: PageProps<"/creators">) {
  const sp = await props.searchParams;
  const raw = sp.sort;
  const sort = parseCreatorSort(Array.isArray(raw) ? raw[0] : raw);
  const all = await getCreators();
  const ranked = rankCreators(all, sort);
  const rows = ranked.slice(0, CREATORS_LIMIT);
  const groups = all.filter((c) => c.type === "Group").length;
  const withHit = all.filter((c) => c.hits > 0).length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Creators</h1>
        <p className="text-muted-foreground">
          The users and groups behind the games rodict tracks. Counts only cover games our discovery
          has found, not each creator&apos;s whole catalog.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Creators"
          value={formatCompact(all.length)}
          hint={`${formatCompact(groups)} groups · ${formatCompact(all.length - groups)} users`}
        />
        <StatTile
          label="With a hit"
          value={formatCompact(withHit)}
          hint={`Peak ≥ ${formatCompact(HIT_PEAK_PLAYERS)} players`}
        />
        <StatTile
          label="Games per creator"
          value={all.length ? (all.reduce((s, c) => s + c.games, 0) / all.length).toFixed(1) : "—"}
          hint="Average"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            {ranked.length > rows.length
              ? `Top ${rows.length} of ${formatCompact(ranked.length)}`
              : `${rows.length} creator${rows.length === 1 ? "" : "s"}`}
          </h2>
          <PresetLinks param="sort" options={CREATOR_SORTS} current={sort} clearValue="playing" />
        </div>
        {sort === "hitRate" && (
          <p className="text-sm text-muted-foreground">
            Hit rate ranks only creators with at least {HIT_RATE_MIN_GAMES} tracked games, so one
            lucky game doesn&apos;t make a 100%.
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead className="text-right">Players now</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Hits</TableHead>
                <TableHead className="text-right">Hit rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No creators yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c, i) => {
                const href = creatorPath(c.id, c.type)!;
                return (
                  <TableRow key={href}>
                    <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Link href={href} className="hover:underline">
                          {c.name ?? `${c.type} ${c.id}`}
                        </Link>
                        {c.type === "Group" && <Badge variant="outline">Group</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(c.totalPlaying)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(c.games)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(c.active)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(c.hits)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.games >= HIT_RATE_MIN_GAMES ? `${Math.round(hitRate(c) * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          A <span className="font-medium text-foreground">hit</span> is a game whose observed
          all-time peak reached {formatCompact(HIT_PEAK_PLAYERS)} concurrent players; hit rate is
          hits ÷ games tracked. Active means not dead by our rule. Peaks only cover the time since
          we started tracking a game.
        </p>
      </div>
    </div>
  );
}
