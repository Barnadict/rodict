import Image from "next/image";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { GenreBadge } from "@/components/genre-badge";
import { Rank } from "@/components/rank";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { formatCompact } from "@/lib/format";

interface GridGame {
  id: string;
  universeId: bigint;
  name: string;
  currentPlaying: number;
  currentGenre: { name: string; slug: string } | null;
}

interface GamesGridProps {
  games: GridGame[];
  /** universeId (stringified) -> icon URL, or null if Roblox has none. */
  icons: Map<string, string | null> | null;
  /** Position of the first game in the current sort (pages after the first). */
  startRank: number;
}

/**
 * The thumbnail-first counterpart to the games table. Each card is one big
 * square icon with just enough text underneath to identify the game — the
 * dense stat columns live in the table view instead.
 */
export function GamesGrid({ games, icons, startRank }: GamesGridProps) {
  if (games.length === 0) {
    return (
      <EmptyState
        tone="plain"
        title="No games match these filters"
        hint="Loosen a filter or clear the search to see more of the list."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {games.map((game, i) => {
        const iconUrl = icons?.get(String(game.universeId)) ?? null;
        return (
          <Link
            key={game.id}
            href={`/games/${game.universeId}`}
            className="group flex flex-col gap-2"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
              {iconUrl ? (
                <Image
                  src={iconUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 16vw, (min-width: 768px) 22vw, (min-width: 640px) 30vw, 45vw"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
              <div className="absolute top-2 right-2">
                <WatchlistButton
                  kind="game"
                  id={game.universeId.toString()}
                  name={game.name}
                  size="icon"
                />
              </div>
              {game.currentGenre && (
                <GenreBadge
                  name={game.currentGenre.name}
                  slug={game.currentGenre.slug}
                  className="absolute bottom-2 left-2 rounded-[4px] bg-background/90 px-1.5 py-0.5"
                />
              )}
            </div>
            <div className="flex items-start gap-2.5 border-t-2 border-rule pt-1.5">
              <Rank value={startRank + i} size="sm" className="min-w-6" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="line-clamp-2 text-sm leading-snug font-bold group-hover:underline">
                  {game.name}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {formatCompact(game.currentPlaying)} playing
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
