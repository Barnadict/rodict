"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, X, AlertTriangle, Gamepad2, Shapes, Check, Users } from "lucide-react";

import { useWatchlist } from "@/lib/watchlist/store";
import {
  fetchWatchlistGames,
  fetchWatchlistGenres,
  type WatchlistGameData,
  type WatchlistGenreData,
} from "@/lib/watchlist/lookup";
import { entriesToAdd, type NamedEntry, type SharedList } from "@/lib/watchlist/share";
import { formatCompact, formatUsdRange } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GameIcon } from "@/components/game-icon";
import { GenreBadge, GenreDot } from "@/components/genre-badge";
import { Sparkline } from "@/components/sparkline";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; games: WatchlistGameData[]; genres: WatchlistGenreData[] };

/** A list entry: the id, plus the name to show before (or without) live data. */
interface ListItem {
  id: string;
  name: string;
}

/**
 * Live data for a set of ids. Keyed on the joined ids, so a re-render with an
 * equal list doesn't fetch again.
 */
function useWatchlistData(gameIds: string[], genreIds: string[]): LoadState {
  const gamesKey = gameIds.join(",");
  const genresKey = genreIds.join(",");
  const hasEntries = gamesKey !== "" || genresKey !== "";
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    // Nothing to load: the empty-list branches render without data, whatever
    // `state` is left over from a previous (non-empty) list.
    if (!hasEntries) return;
    let cancelled = false;
    // No synchronous "reset to loading" here (only inside the .then/.catch
    // callbacks below) — a bare setState() in an effect body, outside a
    // callback, is what react-hooks/set-state-in-effect flags. Practical
    // effect: toggling an item while already on this page shows
    // stale-then-fresh data instead of a loading flash — fine, since the
    // initial `useState` default already covers first paint.
    Promise.all([
      fetchWatchlistGames(gamesKey ? gamesKey.split(",") : []),
      fetchWatchlistGenres(genresKey ? genresKey.split(",") : []),
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
  }, [gamesKey, genresKey, hasEntries]);

  return state;
}

/** The visitor's own watchlist, from this device. */
export function WatchlistView() {
  const { entries, remove } = useWatchlist();

  const games = React.useMemo(() => entries.filter((e) => e.kind === "game"), [entries]);
  const genres = React.useMemo(() => entries.filter((e) => e.kind === "genre"), [entries]);
  const state = useWatchlistData(
    games.map((e) => e.id),
    genres.map((e) => e.id),
  );

  if (games.length === 0 && genres.length === 0) {
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

  return <WatchlistItems games={games} genres={genres} state={state} onRemove={remove} />;
}

/**
 * A watchlist someone shared as a link (Task #113): shown read-only, with a
 * button that adds its games and genres to this device's own list.
 */
export function SharedWatchlistView({ list }: { list: SharedList }) {
  const { entries, addMany } = useWatchlist();
  const state = useWatchlistData(list.games, list.genres);
  const [saved, setSaved] = React.useState<number | null>(null);

  // Names come from live data; until it loads (or for an id that's gone) the
  // id stands in.
  const nameOf = (kind: "game" | "genre", id: string) => {
    if (state.status !== "ready") return id;
    return kind === "game"
      ? (state.games.find((g) => g.universeId === id)?.name ?? id)
      : (state.genres.find((g) => g.slug === id)?.name ?? id);
  };
  const games = list.games.map((id) => ({ id, name: nameOf("game", id) }));
  const genres = list.genres.map((id) => ({ id, name: nameOf("genre", id) }));

  // Only entries that still resolve are saved: a stale id would sit in the
  // list as "no longer tracked" from the start.
  const resolved: NamedEntry[] =
    state.status === "ready"
      ? [
          ...state.games.map((g) => ({ kind: "game" as const, id: g.universeId, name: g.name })),
          ...state.genres.map((g) => ({ kind: "genre" as const, id: g.slug, name: g.name })),
        ]
      : [];
  const toAdd = entriesToAdd(resolved, entries);

  function save() {
    addMany(toAdd);
    setSaved(toAdd.length);
  }

  const counts = [
    list.games.length > 0 && `${list.games.length} game${list.games.length === 1 ? "" : "s"}`,
    list.genres.length > 0 && `${list.genres.length} genre${list.genres.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-medium">A shared watchlist</span>{" "}
            <span className="text-muted-foreground">
              with {counts}. Saving adds them to the watchlist on this device; nothing is stored
              anywhere else.
            </span>
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {saved !== null ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground" role="status">
              <Check className="size-4 text-emerald-500" aria-hidden="true" />
              {saved === 0 ? "Already in your watchlist" : `Added ${saved}`}
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={state.status !== "ready" || toAdd.length === 0}
            >
              <Bookmark aria-hidden="true" />
              {state.status === "ready" && toAdd.length === 0 && resolved.length > 0
                ? "Already saved"
                : "Save to my watchlist"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/watchlist" />}
          >
            My watchlist
          </Button>
        </div>
      </div>
      <WatchlistItems games={games} genres={genres} state={state} />
    </div>
  );
}

function WatchlistItems({
  games,
  genres,
  state,
  onRemove,
}: {
  games: ListItem[];
  genres: ListItem[];
  state: LoadState;
  /** Omitted for a shared list, which is read-only. */
  onRemove?: (kind: "game" | "genre", id: string) => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the watchlist…</span>
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
        <p>Couldn&apos;t load the watchlist right now.</p>
        <p className="text-sm">
          {onRemove
            ? "Your saved games/genres are still on this device — try reloading."
            : "Try reloading."}
        </p>
      </div>
    );
  }

  const gameById = new Map(state.games.map((g) => [g.universeId, g]));
  const genreBySlug = new Map(state.genres.map((g) => [g.slug, g]));

  return (
    <div className="flex flex-col gap-6">
      {games.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 font-medium">
            <Gamepad2 className="size-4" aria-hidden="true" /> Games
          </h2>
          <div className="flex flex-col divide-y rounded-lg border">
            {games.map((entry) => {
              const data = gameById.get(entry.id);
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3">
                  <GameIcon src={data?.icon} size={40} />
                  {data ? (
                    <Link
                      href={`/games/${entry.id}`}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline"
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium">{data.name}</span>
                        {data.genreName && <GenreBadge name={data.genreName} />}
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
                  ) : null}
                  {data && <Sparkline values={data.spark} className="hidden sm:inline-block" />}
                  {data ? null : (
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium text-muted-foreground">
                        {entry.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        No longer tracked — this game may have dropped out of collection.
                      </span>
                    </div>
                  )}
                  {onRemove && (
                    <RemoveButton name={entry.name} onClick={() => onRemove("game", entry.id)} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {genres.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 font-medium">
            <Shapes className="size-4" aria-hidden="true" /> Genres
          </h2>
          <div className="flex flex-col divide-y rounded-lg border">
            {genres.map((entry) => {
              const data = genreBySlug.get(entry.id);
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3">
                  {data ? (
                    <Link
                      href={`/genres/${entry.id}`}
                      className="flex min-w-0 flex-1 flex-col gap-0.5 hover:underline"
                    >
                      <span className="inline-flex items-center gap-1.5 truncate font-medium">
                        <GenreDot genre={data.slug} />
                        {data.name}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatCompact(data.gameCount)} games · {formatCompact(data.totalPlaying)}{" "}
                        players · {formatUsdRange(data.estLow, data.estHigh)} est./day
                      </span>
                    </Link>
                  ) : null}
                  {data && <Sparkline values={data.spark} className="hidden sm:inline-block" />}
                  {data ? null : (
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium text-muted-foreground">
                        {entry.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        No longer available — this genre may have been retired.
                      </span>
                    </div>
                  )}
                  {onRemove && (
                    <RemoveButton name={entry.name} onClick={() => onRemove("genre", entry.id)} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function RemoveButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Remove ${name} from watchlist`}
      title="Remove from watchlist"
      onClick={onClick}
    >
      <X aria-hidden="true" className="size-3.5" />
    </Button>
  );
}
