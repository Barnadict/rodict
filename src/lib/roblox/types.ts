/**
 * Types for the Roblox web API responses this client consumes. Field sets were
 * confirmed against the live endpoints (Task #6); Roblox's API is semi-official
 * and unversioned, so treat these as best-effort and validate before persisting
 * (that's Task #7's job).
 */

export type RobloxCreatorType = "User" | "Group";

/** One entry from GET games.roblox.com/v1/games?universeIds=... */
export interface RobloxGameDetail {
  id: number; // universeId
  rootPlaceId: number;
  name: string;
  description: string | null;
  creator: {
    id: number;
    name: string;
    type: RobloxCreatorType;
    hasVerifiedBadge: boolean;
  };
  price: number | null;
  playing: number;
  visits: number;
  maxPlayers: number;
  created: string; // ISO timestamp (UTC)
  updated: string; // ISO timestamp (UTC)
  // Genre signals — legacy `genre` plus the modern two-level taxonomy. Feed these
  // (most-specific first: genre_l2, genre_l1, genre) to the taxonomy resolver.
  genre: string | null;
  genre_l1: string | null;
  genre_l2: string | null;
  favoritedCount: number;
  canonicalUrlPath?: string | null;
}

/** One entry from GET games.roblox.com/v1/games/votes?universeIds=... */
export interface RobloxGameVotes {
  id: number; // universeId
  upVotes: number;
  downVotes: number;
}

/** One entry from the thumbnails endpoints (icons + screenshots). */
export interface RobloxThumbnail {
  targetId: number;
  state: "Completed" | "Pending" | "Blocked" | "Error" | string;
  imageUrl: string | null;
}

/** Per-universe screenshot group from the multiget thumbnails endpoint. */
export interface RobloxGameThumbnails {
  universeId: number;
  error: string | null;
  thumbnails: RobloxThumbnail[];
}

/** A flattened game result from the omni-search discovery endpoint. */
export interface RobloxSearchGame {
  universeId: number;
  rootPlaceId: number;
  name: string;
  description: string;
  playerCount: number;
  totalUpVotes: number;
  totalDownVotes: number;
  creatorName: string;
  creatorId: number;
  creatorHasVerifiedBadge: boolean;
  canonicalUrlPath: string;
}

// --- Raw wrapper shapes (internal) ---

export interface RobloxDataList<T> {
  data: T[];
}

export interface RobloxUniverseIdResponse {
  universeId: number | null;
}

export interface RobloxOmniSearchResponse {
  searchResults: {
    contentGroupType: string; // "Game" | "Creator" | ...
    contents: RobloxSearchGame[];
    topicId?: string;
  }[];
  nextPageToken: string;
}

/** One sort ("Top Trending", "Up-and-Coming", ...) from the explore-api charts. */
export interface RobloxExploreSort {
  sortId: string;
  sortDisplayName: string;
}

/** GET apis.roblox.com/explore-api/v1/get-sorts */
export interface RobloxExploreSortsResponse {
  sorts: RobloxExploreSort[];
  nextSortsPageToken?: string;
}

/** One game entry inside a sort's content. The explore endpoint returns a
 * richer object than we consume; only `universeId` is load-bearing here. */
export interface RobloxExploreGame {
  universeId: number;
  rootPlaceId?: number;
  name?: string;
}

/** GET apis.roblox.com/explore-api/v1/get-sort-content */
export interface RobloxExploreSortContentResponse {
  games?: RobloxExploreGame[];
  nextPageToken?: string;
}
