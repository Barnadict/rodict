"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, X, AlertTriangle, Gamepad2, Shapes } from "lucide-react";

import { useWatchlist } from "@/lib/watchlist/store";
import {
  fetchWatchlistGames,
  fetchWatchlistGenres,
  type WatchlistGameData,
  type WatchlistGenreData,
} from "@/lib/watchlist/lookup";
import { formatCompact, formatUsdRange } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; games: WatchlistGameData[]; genres: WatchlistGenreData[] };

export function WatchlistView() {
  const { entries, remove } = useWatchlist();

  const gameEntries = React.useMemo(() => entries.filter((e) => e.kind === "game"), [entries]);
  const genreEntries = React.useMemo(() => entries.filter((e) => e.kind === "genre"), [entries]);

  const hasEntries = gameEntries.length > 0 || genreEntries.length > 0;
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    // Nothing watched — skip the fetch entirely. The `!hasEntries` render
    // branch below handles this case directly, regardless of whatever `state`
    // is left over from a previous (non-empty) watchlist.
    if (!hasEntries) return;
    let cancelled = false;
    // No synchronous "reset to loading" here (only inside the .then/.catch
    // callbacks below) — a bare setState() in an effect body, outside a
    // callback, is what react-hooks/set-state-in-effect flags. Practical
    // effect: toggling an item while already on this page shows
    // stale-then-fresh data instead of a loading flash — fine, since the
    // initial `useState` default already covers first paint.
    Promise.all([
      fetchWatchlistGames(gameEntries.map((e) => e.id)),
      fetchWatchlistGenres(genreEntries.map((e) => e.id)),
    ])
      .then(([games, genres]) => {
        if (!cancelled) setState({ status: "ready", games, genres });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [gameEntries, genreEntries, hasEntries]);

  if (!hasEntries) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-muted-foreground">
        <Bookmark className="size-6" aria-hidden="true" />
        <p>Your watchlist is empty.</p>
        <p className="text-sm">
          Add games or genres from{" "}
          <Link href="/games" className="underline hover:text-foreground">
            Games
          </Link>{" "}
          or{" "}
          <Link href="/genres" className="underline hover:text-foreground">
            Genres
          </Link>{" "}
          — saved on this device only, no account needed.
        </p>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your watchlist…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        role="alert"
        className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-muted-foreground"
      >
        <AlertTriangle className="size-6" aria-hidden="true" />
        <p>Couldn&apos;t load your watchlist right now.</p>
        <p className="text-sm">Your saved games/genres are still on this device — try reloading.</p>
      </div>
    );
  }

  const gameById = new Map(state.games.map((g) => [g.universeId, g]));
  const genreBySlug = new Map(state.genres.map((g) => [g.slug, g]));

  return (
    <div className="flex flex-col gap-6">
      {gameEntries.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 font-medium">
            <Gamepad2 className="size-4" aria-hidden="true" /> Games
          </h2>
          <div className="flex flex-col divide-y rounded-lg border">
            {gameEntries.map((entry) => {
              const data = gameById.get(entry.id);
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3">
                  {data ? (
                    <Link
                      href={`/games/${entry.id}`}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline"
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium">{data.name}</span>
                        {data.genreName && (
                          <Badge variant="secondary" className="text-[10px]">
                            {data.genreName}
                          </Badge>
                        )}
                        {data.status === "dead" && (
                          <Badge variant="destructive" className="text-[10px]">
                            Dead
                          </Badge>
                        )}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatCompact(data.currentPlaying)} players ·{" "}
                        {formatCompact(data.currentVisits)} visits ·{" "}
                        {formatUsdRange(data.estLow, data.estHigh)} est./day
                      </span>
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium text-muted-foreground">
                        {entry.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        No longer tracked — this game may have dropped out of collection.
                      </span>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${entry.name} from watchlist`}
                    title="Remove from watchlist"
                    onClick={() => remove("game", entry.id)}
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {genreEntries.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 font-medium">
            <Shapes className="size-4" aria-hidden="true" /> Genres
          </h2>
          <div className="flex flex-col divide-y rounded-lg border">
            {genreEntries.map((entry) => {
              const data = genreBySlug.get(entry.id);
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3">
                  {data ? (
                    <Link
                      href={`/genres/${entry.id}`}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline"
                    >
                      <span className="truncate font-medium">{data.name}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatCompact(data.gameCount)} games · {formatCompact(data.totalPlaying)}{" "}
                        players · {formatUsdRange(data.estLow, data.estHigh)} est./day
                      </span>
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium text-muted-foreground">
                        {entry.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        No longer available — this genre may have been retired.
                      </span>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${entry.name} from watchlist`}
                    title="Remove from watchlist"
                    onClick={() => remove("genre", entry.id)}
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
