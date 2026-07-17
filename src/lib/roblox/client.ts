/**
 * Typed wrappers around the Roblox web API endpoints we use. All batch calls
 * accept any-length id arrays and chunk internally to Roblox's ~100-id limit.
 *
 * Discovery note: `searchGames` covers keyword-based discovery. The full
 * collection strategy (top games AND new/rising, to avoid survivorship bias)
 * is assembled on top of these primitives in Task #8.
 */

import { robloxGet, type RobloxGetOptions } from "./http";
import type {
  RobloxDataList,
  RobloxExploreSortContentResponse,
  RobloxExploreSortsResponse,
  RobloxGameDetail,
  RobloxGameThumbnails,
  RobloxGameVotes,
  RobloxOmniSearchResponse,
  RobloxSearchGame,
  RobloxThumbnail,
  RobloxUniverseIdResponse,
} from "./types";

const GAMES_API = "https://games.roblox.com";
const THUMBNAILS_API = "https://thumbnails.roblox.com";
const APIS = "https://apis.roblox.com";

// Roblox's games API rejects batches of 100 ids with "Too many universe IDs
// were requested" (error code 9) — discovered via a real GitHub Actions run
// that (unlike every local test so far) exceeded 100 discovered games.
const BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Fetch a list of id-batches, tolerating per-batch failures.
 *
 * At a few hundred games one failed batch aborting the whole call is a
 * non-event — you just re-run. At thousands it means a single stubborn 429 (on
 * batch 3 of 100, say) throws away 97 good batches of irreplaceable snapshot
 * data. So a batch that exhausts its retries is skipped and counted, not
 * rethrown: the run persists everything it did get, and the survivorship guard
 * re-collects the missed games next run. `failedBatches > 0` surfaces as a
 * partial run in the collector summary.
 */
async function fetchInBatches<T>(
  ids: number[],
  fetchBatch: (group: number[]) => Promise<T[]>,
): Promise<{ results: T[]; failedBatches: number }> {
  const results: T[] = [];
  let failedBatches = 0;
  for (const group of chunk(ids, BATCH_SIZE)) {
    try {
      results.push(...(await fetchBatch(group)));
    } catch {
      failedBatches++;
    }
  }
  return { results, failedBatches };
}

function dedupe(ids: (number | bigint)[]): number[] {
  return [...new Set(ids.map((id) => Number(id)))];
}

/** Resolve a place id to its universe id. Null if the place doesn't exist. */
export async function getUniverseIdFromPlaceId(
  placeId: number | bigint,
  opts?: RobloxGetOptions,
): Promise<number | null> {
  const data = await robloxGet<RobloxUniverseIdResponse>(
    `${APIS}/universes/v1/places/${placeId}/universe`,
    { ttlMs: 24 * 60 * 60 * 1000, ...opts }, // universe↔place is stable; cache a day
  );
  return data.universeId ?? null;
}

export interface BatchFetchResult<T> {
  data: T[];
  /** Batches whose retries were exhausted and were skipped (partial run). */
  failedBatches: number;
}

// games.roblox.com is the strictest host we hit and the one whose data is
// irreplaceable (a missed batch is a permanent gap in that run's history), so
// its batch calls retry harder than the default before giving up on a batch.
const GAMES_HOST_ATTEMPTS = 8;

/** Fetch full game details for any number of universe ids (chunked, fault-tolerant). */
export async function getGameDetails(
  universeIds: (number | bigint)[],
  opts?: RobloxGetOptions,
): Promise<BatchFetchResult<RobloxGameDetail>> {
  const ids = dedupe(universeIds);
  const { results, failedBatches } = await fetchInBatches(ids, async (group) => {
    const data = await robloxGet<RobloxDataList<RobloxGameDetail>>(
      `${GAMES_API}/v1/games?universeIds=${group.join(",")}`,
      { maxAttempts: GAMES_HOST_ATTEMPTS, ...opts },
    );
    return data.data;
  });
  return { data: results, failedBatches };
}

/** Fetch up/down votes for any number of universe ids (chunked, fault-tolerant). */
export async function getGameVotes(
  universeIds: (number | bigint)[],
  opts?: RobloxGetOptions,
): Promise<BatchFetchResult<RobloxGameVotes>> {
  const ids = dedupe(universeIds);
  const { results, failedBatches } = await fetchInBatches(ids, async (group) => {
    const data = await robloxGet<RobloxDataList<RobloxGameVotes>>(
      `${GAMES_API}/v1/games/votes?universeIds=${group.join(",")}`,
      { maxAttempts: GAMES_HOST_ATTEMPTS, ...opts },
    );
    return data.data;
  });
  return { data: results, failedBatches };
}

export interface GameIcon {
  universeId: number;
  imageUrl: string | null;
  state: string;
}

/** Fetch game icon image URLs for any number of universe ids (chunked). */
export async function getGameIcons(
  universeIds: (number | bigint)[],
  opts?: RobloxGetOptions & { size?: string },
): Promise<GameIcon[]> {
  const ids = dedupe(universeIds);
  const size = opts?.size ?? "512x512";
  const results: GameIcon[] = [];
  for (const group of chunk(ids, BATCH_SIZE)) {
    const data = await robloxGet<RobloxDataList<RobloxThumbnail & { targetId: number }>>(
      `${THUMBNAILS_API}/v1/games/icons?universeIds=${group.join(",")}` +
        `&size=${size}&format=Png&isCircular=false`,
      { ttlMs: 6 * 60 * 60 * 1000, ...opts }, // icons rarely change; cache 6h
    );
    for (const t of data.data) {
      results.push({
        universeId: t.targetId,
        imageUrl: t.imageUrl,
        state: t.state,
      });
    }
  }
  return results;
}

/** Fetch screenshot thumbnails for any number of universe ids (chunked). */
export async function getGameThumbnails(
  universeIds: (number | bigint)[],
  opts?: RobloxGetOptions & { countPerUniverse?: number; size?: string },
): Promise<RobloxGameThumbnails[]> {
  const ids = dedupe(universeIds);
  const count = opts?.countPerUniverse ?? 1;
  const size = opts?.size ?? "768x432";
  const results: RobloxGameThumbnails[] = [];
  for (const group of chunk(ids, BATCH_SIZE)) {
    const data = await robloxGet<RobloxDataList<RobloxGameThumbnails>>(
      `${THUMBNAILS_API}/v1/games/multiget/thumbnails?universeIds=${group.join(",")}` +
        `&countPerUniverse=${count}&size=${size}&format=Png`,
      { ttlMs: 6 * 60 * 60 * 1000, ...opts },
    );
    results.push(...data.data);
  }
  return results;
}

function gamesFromOmni(data: RobloxOmniSearchResponse): RobloxSearchGame[] {
  return data.searchResults
    .filter((group) => group.contentGroupType === "Game")
    .flatMap((group) => group.contents);
}

/**
 * Keyword game discovery via the omni-search endpoint.
 *
 * One page returns ~40 games; the deep tail of a query only appears if you
 * follow `nextPageToken`. `maxPages` bounds how far to walk (default 1 — one
 * page, the old behaviour). A query typically dries up after 4–9 pages, at
 * which point a page comes back empty and we stop early regardless of maxPages.
 *
 * `limit`, if given, caps the flattened result AFTER pagination — so
 * `{ maxPages: 10 }` with no limit returns everything the query reaches.
 */
export async function searchGames(
  query: string,
  opts?: RobloxGetOptions & { limit?: number; maxPages?: number },
): Promise<RobloxSearchGame[]> {
  const maxPages = Math.max(1, opts?.maxPages ?? 1);
  // One session id for the whole walk: the page tokens are issued within a
  // search session, so reusing it keeps the pagination cursor coherent.
  const sessionId = globalThis.crypto.randomUUID();
  const seen = new Set<number>();
  const games: RobloxSearchGame[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    let url =
      `${APIS}/search-api/omni-search?searchQuery=${encodeURIComponent(query)}` +
      `&sessionId=${sessionId}&pageType=all`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const data = await robloxGet<RobloxOmniSearchResponse>(url, opts);
    const pageGames = gamesFromOmni(data);
    if (pageGames.length === 0) break; // query exhausted

    for (const g of pageGames) {
      if (!seen.has(g.universeId)) {
        seen.add(g.universeId);
        games.push(g);
      }
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return typeof opts?.limit === "number" ? games.slice(0, opts.limit) : games;
}

/** List the available explore-api charts (Top Trending, Up-and-Coming, ...). */
export async function getExploreSorts(
  opts?: RobloxGetOptions,
): Promise<RobloxExploreSortsResponse> {
  const sessionId = globalThis.crypto.randomUUID();
  return robloxGet<RobloxExploreSortsResponse>(
    `${APIS}/explore-api/v1/get-sorts?sessionId=${sessionId}`,
    opts,
  );
}

/**
 * Universe ids from one explore-api chart, following pagination up to
 * `maxPages`. These are the real "charts" (Top Playing Now, Up-and-Coming,
 * ...) — Up-and-Coming in particular surfaces games near launch, which keyword
 * search misses and which the survivorship-bias guard wants.
 */
export async function getExploreSortUniverseIds(
  sortId: string,
  opts?: RobloxGetOptions & { maxPages?: number },
): Promise<number[]> {
  const maxPages = Math.max(1, opts?.maxPages ?? 1);
  const sessionId = globalThis.crypto.randomUUID();
  const ids = new Set<number>();
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    let url =
      `${APIS}/explore-api/v1/get-sort-content?sessionId=${sessionId}` +
      `&sortId=${encodeURIComponent(sortId)}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const data = await robloxGet<RobloxExploreSortContentResponse>(url, opts);
    const games = data.games ?? [];
    if (games.length === 0) break;
    for (const g of games) if (typeof g.universeId === "number") ids.add(g.universeId);

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return [...ids];
}
