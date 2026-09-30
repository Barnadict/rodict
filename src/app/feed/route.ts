import type { NextRequest } from "next/server";
import { cacheLife } from "next/cache";

import { getFeedSubjects } from "@/lib/db/feed";
import { buildFeedEntries, feedQuery, parseFeedIds, renderAtom } from "@/lib/feed";

/**
 * The feed's data, cached like the pages. `use cache` can't sit in the handler
 * body itself, and the ids arrive parsed and sorted so equal watchlists share an
 * entry. The clock is read inside, as the theme page does, so a cache hit
 * serves one consistent build.
 */
async function getFeed(games: string[], genres: string[]) {
  "use cache";
  cacheLife("hours");

  const now = new Date();
  const subjects = await getFeedSubjects({ games, genres }, now);
  return { entries: buildFeedEntries(subjects, now), watching: subjects.length, now };
}

/** Atom feed of flagged changes and big weekly moves for a watchlist (Task #68). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const games = parseFeedIds(params.get("games"), "game");
  const genres = parseFeedIds(params.get("genres"), "genre");
  const query = feedQuery({ games, genres });
  if (!query) {
    return new Response(
      "Add ?games=<universe ids> and/or ?genres=<genre slugs>, comma-separated.",
      {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  const { entries, watching, now } = await getFeed(games, genres);
  const body = renderAtom({
    origin: request.nextUrl.origin,
    selfPath: `/feed${query}`,
    entries,
    updated: entries[0]?.updated ?? now,
    watching,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      // Data only changes every few hours; this also spares the DB when a
      // reader polls every few minutes.
      "Cache-Control": "public, max-age=900",
    },
  });
}
