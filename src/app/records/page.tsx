import Link from "next/link";
import { cacheLife } from "next/cache";

import {
  getLongevityRecords,
  getMoveRecords,
  getPeakRecords,
  getSpeedCandidates,
} from "@/lib/db/records";
import { formatCompact } from "@/lib/format";
import { formatGrowthPct } from "@/lib/stats";
import { NEAR_LAUNCH_DAYS } from "@/lib/launch-benchmark";
import {
  LONGEVITY_MIN_PLAYERS,
  SPEED_THRESHOLDS,
  formatAge,
  formatDays,
  rankSpeed,
} from "@/lib/records";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LocalTime } from "@/components/local-time";

export const metadata = {
  title: "Records — rodict",
  description:
    "All-time peaks, the biggest jumps and collapses, the fastest launches to 1K and 10K players, and the longest-lived Roblox games still going.",
};

/** Every record table, cached like the pages: the data changes every few hours. */
async function getRecords() {
  // Remote (Task #98): few distinct keys, so a cold instance reuses another's entry.
  "use cache: remote";
  cacheLife("hours");

  const [peaks, moves, longevity, ...speeds] = await Promise.all([
    getPeakRecords(),
    getMoveRecords(),
    getLongevityRecords(),
    ...SPEED_THRESHOLDS.map((t) => getSpeedCandidates(t)),
  ]);
  return {
    peaks,
    moves,
    longevity,
    speeds: SPEED_THRESHOLDS.map((threshold, i) => ({ threshold, rows: rankSpeed(speeds[i]) })),
    // Ages are measured to when the data was read, inside the cache.
    asOf: new Date(),
  };
}

type GameRef = {
  universeId: bigint;
  name: string;
  status: string;
  currentGenre?: { slug: string; name: string } | null;
  genre?: { slug: string; name: string } | null;
};

function GameCell({ game }: { game: GameRef }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Link href={`/games/${game.universeId}`} className="font-medium hover:underline">
        {game.name}
      </Link>
      {game.status === "dead" && <Badge variant="destructive">Dead</Badge>}
    </span>
  );
}

function GenreCell({ game }: { game: GameRef }) {
  const genre = game.currentGenre ?? game.genre;
  return genre ? (
    <Link href={`/genres/${genre.slug}`} className="hover:underline">
      {genre.name}
    </Link>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">{children}</div>
    </section>
  );
}

function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="h-20 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

export default async function RecordsPage() {
  const { peaks, moves, longevity, speeds, asOf } = await getRecords();

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Records</h1>
        <p className="text-muted-foreground">
          The extremes in everything rodict tracks. Records only cover what we&apos;ve observed:
          peaks and moves since each game was first tracked, and nothing from the collection gap of
          20 Aug – 29 Sep 2026.
        </p>
        <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href="#peaks" className="underline-offset-4 hover:underline">
            All-time peaks
          </a>
          <a href="#jumps" className="underline-offset-4 hover:underline">
            Biggest jumps
          </a>
          <a href="#collapses" className="underline-offset-4 hover:underline">
            Biggest collapses
          </a>
          <a href="#fastest" className="underline-offset-4 hover:underline">
            Fastest launches
          </a>
          <a href="#longest" className="underline-offset-4 hover:underline">
            Longest-lived
          </a>
        </nav>
      </div>

      <Section
        id="peaks"
        title="All-time peaks"
        description="The most concurrent players we've recorded for a game at one collection."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Genre</TableHead>
              <TableHead className="text-right">Peak players</TableHead>
              <TableHead className="text-right">Reached</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {peaks.length === 0 && <EmptyRow cols={5}>No games tracked yet.</EmptyRow>}
            {peaks.map((g, i) => (
              <TableRow key={g.id}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <GameCell game={g} />
                </TableCell>
                <TableCell>
                  <GenreCell game={g} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCompact(g.allTimePeakPlayers)}
                </TableCell>
                <TableCell className="text-right">
                  {g.allTimePeakAt ? (
                    <LocalTime value={g.allTimePeakAt} options={{ dateStyle: "medium" }} />
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {(
        [
          {
            id: "jumps",
            title: "Biggest jumps",
            rows: moves.gains,
            description:
              "The largest flagged spikes: players gained between two consecutive readings (usually 3 hours apart), from the notable-change detector that marks game charts.",
          },
          {
            id: "collapses",
            title: "Biggest collapses",
            rows: moves.collapses,
            description:
              "The largest flagged drops: players lost between two consecutive readings. A drop can also be a Roblox outage or a game going private.",
          },
        ] as const
      ).map((table) => (
        <Section
          key={table.id}
          id={table.id}
          title={table.title}
          description={
            <>
              {table.description} Ranked by players, not percent, so a small game doubling
              doesn&apos;t outrank a big one.{" "}
              <Link href="/about#forecasts" className="underline underline-offset-2">
                How changes are flagged
              </Link>
            </>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Game</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.length === 0 && (
                <EmptyRow cols={6}>None flagged yet — they fill in as analytics runs.</EmptyRow>
              )}
              {table.rows.map((m, i) => (
                <TableRow key={`${m.gameId}-${m.at}`}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <GameCell game={m.game} />
                  </TableCell>
                  <TableCell>
                    <GenreCell game={m.game} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {formatCompact(m.prevValue)} → {formatCompact(m.value)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant={m.direction === "spike" ? "secondary" : "destructive"}>
                      {m.delta >= 0 ? "+" : "−"}
                      {formatCompact(Math.abs(m.delta))} · {formatGrowthPct(m.changePct)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <LocalTime value={m.at} options={{ dateStyle: "medium" }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ))}

      <section id="fastest" className="flex scroll-mt-6 flex-col gap-3">
        <div>
          <h2 className="font-medium">Fastest launches</h2>
          <p className="text-sm text-muted-foreground">
            Time from a game&apos;s creation on Roblox to its first reading at or above the mark.
            Only games we started tracking within {NEAR_LAUNCH_DAYS} days of launch count; for an
            older game we can&apos;t know when it first got there. &ldquo;≤&rdquo; means the very
            first reading was already over the mark, so it got there sooner.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {speeds.map(({ threshold, rows }) => (
            <div key={threshold} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">To {formatCompact(threshold)} players</h3>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Game</TableHead>
                      <TableHead>Genre</TableHead>
                      <TableHead className="text-right">Took</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && (
                      <EmptyRow cols={4}>No game tracked from launch has got there yet.</EmptyRow>
                    )}
                    {rows.map((r, i) => (
                      <TableRow key={r.row.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <GameCell game={r.row} />
                        </TableCell>
                        <TableCell>
                          <GenreCell game={r.row} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.upperBound ? "≤ " : ""}
                          {formatDays(r.days)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Section
        id="longest"
        title="Longest-lived, still going"
        description={`The oldest games (by Roblox creation date) that aren't dead by our rule and still have at least ${LONGEVITY_MIN_PLAYERS} players now.`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Game</TableHead>
              <TableHead>Genre</TableHead>
              <TableHead className="text-right">Players now</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="text-right">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {longevity.length === 0 && <EmptyRow cols={6}>No games qualify yet.</EmptyRow>}
            {longevity.map((g, i) => (
              <TableRow key={g.id}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <GameCell game={g} />
                </TableCell>
                <TableCell>
                  <GenreCell game={g} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCompact(g.currentPlaying)}
                </TableCell>
                <TableCell className="text-right">
                  <LocalTime value={g.robloxCreatedAt!} options={{ dateStyle: "medium" }} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatAge(g.robloxCreatedAt!, asOf)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
