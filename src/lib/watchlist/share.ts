/**
 * Shareable watchlists (Task #113): the list travels in the URL
 * (`/watchlist?games=…&genres=…`), so sharing needs no account and stores
 * nothing server-side. Same parameter names, id checks and cap as the Atom
 * feed (Task #68), so a shared link and a feed URL read the same list. Pure,
 * so it's tested without a browser.
 */

import { feedQuery, parseFeedIds } from "@/lib/feed";

export interface SharedList {
  /** Universe ids. */
  games: string[];
  /** Genre slugs. */
  genres: string[];
}

/** The ids a URL's query string carries; unknown or malformed ids are dropped. */
export function parseSharedList(get: (param: string) => string | null | undefined): SharedList {
  return {
    games: parseFeedIds(get("games"), "game"),
    genres: parseFeedIds(get("genres"), "genre"),
  };
}

export function isSharedList(list: SharedList): boolean {
  return list.games.length > 0 || list.genres.length > 0;
}

/** `/watchlist?games=…&genres=…` for a list, or null when it's empty. */
export function sharePath(list: SharedList): string | null {
  const query = feedQuery({
    games: parseFeedIds(list.games.join(","), "game"),
    genres: parseFeedIds(list.genres.join(","), "genre"),
  });
  return query ? `/watchlist${query}` : null;
}

export interface NamedEntry {
  kind: "game" | "genre";
  id: string;
  name: string;
}

/** Shared entries not already in the visitor's own list, in shared order. */
export function entriesToAdd(
  shared: NamedEntry[],
  own: { kind: "game" | "genre"; id: string }[],
): NamedEntry[] {
  const have = new Set(own.map((e) => `${e.kind}:${e.id}`));
  return shared.filter((e) => !have.has(`${e.kind}:${e.id}`));
}
