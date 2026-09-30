import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import { ExternalLink } from "lucide-react";

import { getCreatorGames } from "@/lib/db/creators";
import { HIT_PEAK_PLAYERS, isHit, parseCreatorParam, summarizeCreator } from "@/lib/creators";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { formatCompact, formatUsdRange } from "@/lib/format";
import { robloxCreatorUrl } from "@/lib/game-metrics";
import { getSmallIcons } from "@/lib/game-icons";

import { Badge } from "@/components/ui/badge";
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
import { LocalTime } from "@/components/local-time";
import { GameIcon } from "@/components/game-icon";
import { GenreDot } from "@/components/genre-badge";
import { PageHeader } from "@/components/page-header";

/** Icons for at most this many of a creator's games (most played first). */
const ICON_LIMIT = 100;

/** Returns null for a malformed id or a creator with no tracked games; see the
 * note on getGameDetail. */
async function getCreatorDetail(param: string) {
  "use cache";
  cacheLife("hours");

  const creator = parseCreatorParam(param);
  if (!creator) return null;
  const rows = await getCreatorGames(creator);
  if (rows.length === 0) return null;

  const games = rows.map(({ currentGenre, ...g }) => ({ ...g, genre: currentGenre }));
  const summary = summarizeCreator(games);
  const icons = Object.fromEntries(
    await getSmallIcons(games.slice(0, ICON_LIMIT).map((g) => g.universeId)),
  );
  // Priced inside the cache, like the theme page, so no clock read on render.
  const earnings = estimateDailyEarningsFromCcu(summary.totalPlaying, new Date());
  return { creator, games, summary, earnings, icons };
}

export async function generateMetadata(props: PageProps<"/creators/[id]">) {
  const { id } = await props.params;
  const data = await getCreatorDetail(id);
  return { title: data?.summary.name ? `${data.summary.name} — rodict` : "Creator — rodict" };
}

export default async function CreatorPage(props: PageProps<"/creators/[id]">) {
  const { id } = await props.params;
  const data = await getCreatorDetail(id);
  if (!data) notFound();
  const { creator, games, summary, earnings, icons } = data;
  const robloxUrl = robloxCreatorUrl(creator.id, creator.type);
  const name = summary.name ?? `${creator.type} ${creator.id}`;
  const iconOf = (universeId: bigint) =>
    String(universeId) in icons ? icons[String(universeId)] : undefined;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        breadcrumbs={[{ label: "Creators", href: "/creators" }]}
        title={name}
        description={`Every game by this ${creator.type === "Group" ? "group" : "user"} that rodict tracks. Not necessarily their whole catalog: only games our discovery has found are included.`}
        actions={
          robloxUrl && (
            <a
              href={robloxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors hover:bg-muted"
            >
              Open on Roblox <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{creator.type === "Group" ? "Group" : "User"}</Badge>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Games tracked"
          value={formatCompact(summary.games)}
          hint={summary.active < summary.games ? `${summary.active} active` : undefined}
        />
        <StatTile label="Players now" value={formatCompact(summary.totalPlaying)} />
        <StatTile
          label="Hits"
          value={formatCompact(summary.hits)}
          hint={`Peak ≥ ${formatCompact(HIT_PEAK_PLAYERS)} players`}
        />
        <StatTile
          label="Est. earnings/day"
          value={formatUsdRange(earnings.low, earnings.high)}
          badge="Est."
        />
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">
        A <span className="font-medium text-foreground">hit</span> is our own threshold: an all-time
        peak of at least {formatCompact(HIT_PEAK_PLAYERS)} concurrent players. The peak only covers
        the time since we started tracking each game, so an older game&apos;s launch peak can be
        missed.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Genres covered</h2>
        {summary.genres.length === 0 ? (
          <p className="text-sm text-muted-foreground">None of their games has a genre yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {summary.genres.map((g) => (
              <Badge key={g.slug} variant="outline" render={<Link href={`/genres/${g.slug}`} />}>
                <GenreDot genre={g.slug} className="size-2" />
                {g.name}
                <span className="text-muted-foreground tabular-nums">
                  {g.games} · {formatCompact(g.playing)} playing
                </span>
              </Badge>
            ))}
          </div>
        )}
        {summary.unclassified > 0 && (
          <p className="text-sm text-muted-foreground">
            {summary.unclassified} game{summary.unclassified === 1 ? " has" : "s have"} no genre.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Games</h2>
        <MobileCards
          items={games.map((game) => ({
            key: game.id,
            href: `/games/${game.universeId}`,
            title: game.name,
            icon: iconOf(game.universeId) ?? null,
            subtitle: (
              <>
                {game.genre && (
                  <span className="inline-flex items-center gap-1.5">
                    <GenreDot genre={game.genre.slug} className="size-2" />
                    {game.genre.name}
                  </span>
                )}
                {isHit(game) && <Badge variant="secondary">Hit</Badge>}
                {game.status === "dead" && <Badge variant="destructive">Dead</Badge>}
              </>
            ),
            stats: [
              { label: "Players", value: formatCompact(game.currentPlaying) },
              { label: "Peak", value: formatCompact(game.allTimePeakPlayers) },
              { label: "Visits", value: formatCompact(game.currentVisits) },
            ],
          }))}
        />
        <div className="hidden overflow-x-auto rounded-lg border sm:block xl:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Game</TableHead>
                <TableHead>Genre</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Peak</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">First tracked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.map((game) => (
                <TableRow key={game.id}>
                  <TableCell className="min-w-48 font-medium whitespace-normal">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <GameIcon src={iconOf(game.universeId)} className="mr-1" />
                      <Link href={`/games/${game.universeId}`} className="hover:underline">
                        {game.name}
                      </Link>
                      {isHit(game) && <Badge variant="secondary">Hit</Badge>}
                      {game.status === "dead" && <Badge variant="destructive">Dead</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>
                    {game.genre ? (
                      <Link
                        href={`/genres/${game.genre.slug}`}
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        <GenreDot genre={game.genre.slug} className="size-2" />
                        {game.genre.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(game.currentPlaying)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(game.allTimePeakPlayers)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompact(game.currentVisits)}
                  </TableCell>
                  <TableCell className="text-right">
                    <LocalTime value={game.firstSeenAt} options={{ dateStyle: "medium" }} />
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
