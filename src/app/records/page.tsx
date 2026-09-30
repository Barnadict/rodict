import Link from "next/link";
import { cacheLife } from "next/cache";

import {
  getLongevityRecords,
  getMoveRecords,
  getPeakRecords,
  getSpeedCandidates,
} from "@/lib/db/records";
import { formatCompact } from "@/lib/format";
import { getSmallIcons } from "@/lib/game-icons";
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
import { GameIcon } from "@/components/game-icon";
import { GenreDot } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";
import { MobileCards, type MobileCard } from "@/components/data-table/mobile-cards";

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
  const ranked = SPEED_THRESHOLDS.map((threshold, i) => ({
    threshold,
    rows: rankSpeed(speeds[i]),
  }));
  // Thumbnails for every listed game (Task #103), in one batch.
  const ids = new Set<string>([
    ...peaks.map((g) => String(g.universeId)),
    ...moves.gains.map((m) => String(m.game.universeId)),
    ...moves.collapses.map((m) => String(m.game.universeId)),
    ...longevity.map((g) => String(g.universeId)),
    ...ranked.flatMap((s) => s.rows.map((r) => String(r.row.universeId))),
  ]);
  const icons = Object.fromEntries(await getSmallIcons([...ids]));
  return {
    peaks,
    moves,
    longevity,
    icons,
    speeds: ranked,
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

type Icons = Record<string, string | null>;

function GameCell({ game, icons }: { game: GameRef; icons: Icons }) {
  return (
    <span className="flex min-w-48 flex-wrap items-center gap-1.5 whitespace-normal">
      <GameIcon src={icons[String(game.universeId)]} className="mr-1" />
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
    <Link
      href={`/genres/${genre.slug}`}
      className="inline-flex items-center gap-1.5 hover:underline"
    >
      <GenreDot genre={genre.slug} className="size-2" />
      {genre.name}
    </Link>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

/** A record row as a phone card (Task #104). */
function gameCard(
  game: GameRef,
  icons: Icons,
  rank: number,
  stats: MobileCard["stats"],
  key: string = String(game.universeId),
): MobileCard {
  const genre = game.currentGenre ?? game.genre;
  return {
    key,
    href: `/games/${game.universeId}`,
    title: game.name,
    icon: icons[String(game.universeId)] ?? null,
    rank,
    subtitle: (
      <>
        {genre && (
          <span className="inline-flex items-center gap-1.5">
            <GenreDot genre={genre.slug} className="size-2" />
            {genre.name}
          </span>
        )}
        {game.status === "dead" && <Badge variant="destructive">Dead</Badge>}
      </>
    ),
    stats,
  };
}

function Section({
  id,
  title,
  description,
  cards,
  empty,
  children,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  cards: MobileCard[];
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <MobileCards items={cards} empty={empty} />
      <div className="hidden overflow-x-auto rounded-lg border sm:block xl:overflow-visible">
        {children}
      </div>
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
  const { peaks, moves, longevity, speeds, asOf, icons } = await getRecords();

  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <PageHeader
        title="Records"
        description="The extremes in everything rodict tracks. Records only cover what we've observed: peaks and moves since each game was first tracked, and nothing from the collection gap of 20 Aug – 29 Sep 2026."
      >
        <nav className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
      </PageHeader>

      <Section
        id="peaks"
        title="All-time peaks"
        description="The most concurrent players we've recorded for a game at one collection."
        empty="No games tracked yet."
        cards={peaks.map((g, i) =>
          gameCard(g, icons, i + 1, [
            { label: "Peak", value: formatCompact(g.allTimePeakPlayers) },
            {
              label: "Reached",
              value: g.allTimePeakAt ? (
                <LocalTime value={g.allTimePeakAt} options={{ dateStyle: "medium" }} />
              ) : (
                "—"
              ),
            },
          ]),
        )}
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
                  <GameCell game={g} icons={icons} />
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
          empty="None flagged yet — they fill in as analytics runs."
          cards={table.rows.map((m, i) =>
            gameCard(
              m.game,
              icons,
              i + 1,
              [
                {
                  label: "Players",
                  value: `${formatCompact(m.prevValue)} → ${formatCompact(m.value)}`,
                },
                {
                  label: "Change",
                  value: `${m.delta >= 0 ? "+" : "−"}${formatCompact(Math.abs(m.delta))}`,
                },
                {
                  label: "When",
                  value: <LocalTime value={m.at} options={{ dateStyle: "medium" }} />,
                },
              ],
              `${m.gameId}-${m.at}`,
            ),
          )}
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
                    <GameCell game={m.game} icons={icons} />
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
              <MobileCards
                empty="No game tracked from launch has got there yet."
                items={rows.map((r, i) =>
                  gameCard(r.row, icons, i + 1, [
                    { label: "Took", value: `${r.upperBound ? "≤ " : ""}${formatDays(r.days)}` },
                  ]),
                )}
              />
              <div className="hidden overflow-x-auto rounded-lg border sm:block xl:overflow-visible">
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
                          <GameCell game={r.row} icons={icons} />
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
        empty="No games qualify yet."
        cards={longevity.map((g, i) =>
          gameCard(g, icons, i + 1, [
            { label: "Players", value: formatCompact(g.currentPlaying) },
            { label: "Age", value: formatAge(g.robloxCreatedAt!, asOf) },
          ]),
        )}
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
                  <GameCell game={g} icons={icons} />
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
