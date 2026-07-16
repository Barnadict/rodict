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

/** Fetch full game details for any number of universe ids (chunked). */
export async function getGameDetails(
  universeIds: (number | bigint)[],
  opts?: RobloxGetOptions,
): Promise<RobloxGameDetail[]> {
  const ids = dedupe(universeIds);
  const results: RobloxGameDetail[] = [];
  for (const group of chunk(ids, BATCH_SIZE)) {
    const data = await robloxGet<RobloxDataList<RobloxGameDetail>>(
      `${GAMES_API}/v1/games?universeIds=${group.join(",")}`,
      opts,
    );
    results.push(...data.data);
  }
  return results;
}

/** Fetch up/down votes for any number of universe ids (chunked). */
export async function getGameVotes(
  universeIds: (number | bigint)[],
  opts?: RobloxGetOptions,
): Promise<RobloxGameVotes[]> {
  const ids = dedupe(universeIds);
  const results: RobloxGameVotes[] = [];
  for (const group of chunk(ids, BATCH_SIZE)) {
    const data = await robloxGet<RobloxDataList<RobloxGameVotes>>(
      `${GAMES_API}/v1/games/votes?universeIds=${group.join(",")}`,
      opts,
    );
    results.push(...data.data);
  }
  return results;
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

/** Keyword game discovery via the omni-search endpoint. */
export async function searchGames(
  query: string,
  opts?: RobloxGetOptions & { limit?: number },
): Promise<RobloxSearchGame[]> {
  const sessionId = globalThis.crypto.randomUUID();
  const data = await robloxGet<RobloxOmniSearchResponse>(
    `${APIS}/search-api/omni-search?searchQuery=${encodeURIComponent(query)}` +
      `&sessionId=${sessionId}&pageType=all`,
    opts,
  );
  const games = data.searchResults
    .filter((group) => group.contentGroupType === "Game")
    .flatMap((group) => group.contents);
  return typeof opts?.limit === "number" ? games.slice(0, opts.limit) : games;
}
