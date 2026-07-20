import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { WatchlistButton } from "@/components/watchlist/watchlist-button";
import { formatCompact } from "@/lib/format";

interface GridGame {
  id: string;
  universeId: bigint;
  name: string;
  currentPlaying: number;
  currentGenre: { name: string } | null;
}

interface GamesGridProps {
  games: GridGame[];
  /** universeId (stringified) -> icon URL, or null if Roblox has none. */
  icons: Map<string, string | null> | null;
}

/**
 * The thumbnail-first counterpart to the games table. Each card is one big
 * square icon with just enough text underneath to identify the game — the
 * dense stat columns live in the table view instead.
 */
export function GamesGrid({ games, icons }: GamesGridProps) {
  if (games.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border text-muted-foreground">
        No games match these filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {games.map((game) => {
        const iconUrl = icons?.get(String(game.universeId)) ?? null;
        return (
          <Link
            key={game.id}
            href={`/games/${game.universeId}`}
            className="glow-primary-hover group flex flex-col overflow-hidden rounded-lg border transition-colors hover:border-primary/50"
          >
            <div className="relative aspect-square w-full overflow-hidden bg-muted">
              {iconUrl ? (
                <Image
                  src={iconUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 16vw, (min-width: 768px) 22vw, (min-width: 640px) 30vw, 45vw"
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
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
                <Badge variant="secondary" className="absolute bottom-2 left-2 text-[10px] shadow">
                  {game.currentGenre.name}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-0.5 p-3">
              <span className="line-clamp-1 text-sm font-medium group-hover:underline">
                {game.name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatCompact(game.currentPlaying)} playing
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
