import { cacheLife } from "next/cache";

import {
  getGameByUniverseId,
  getGameSnapshots,
  getGamesList,
  type GameSortField,
} from "@/lib/db/games";
import { RISING, getRisingGames, getRisingGenres } from "@/lib/db/trends";
import { getGrowthById } from "@/lib/cached-queries";
import { estimateDailyEarningsFromCcu } from "@/lib/earnings/estimate";
import { rangeToCutoff, RANGE_CLEAR_VALUE, type RangeKey } from "@/lib/date-range";
import {
  LIKE_RATIO_MIN_VOTES,
  ageToCreatedRange,
  type AgeFilter,
  type StatusFilter,
} from "@/lib/games-list";
import { ESTIMATE_NOTE, buildTable, iso, usd, type ExportTable } from "@/lib/export";

/**
 * Datasets behind the Export buttons (Task #71), each cached like the pages
 * that show them, and keyed on parsed params so equal requests share an entry.
 * They return the finished table; the route only serializes it.
 */

/** Most rows a games export returns (the busiest first by default). */
export const EXPORT_MAX_GAMES = 1000;
/** Rows in a trending export (the page shows 25). */
export const EXPORT_TRENDING_ROWS = 100;

export interface GamesExportParams {
  genreSlug?: string;
  themeSlug?: string;
  status?: StatusFilter;
  age?: AgeFilter;
  minPlaying?: number;
  search?: string;
  sort: GameSortField;
  order: "asc" | "desc";
  range: RangeKey;
}

export async function getGamesExport(p: GamesExportParams): Promise<ExportTable> {
  "use cache";
  cacheLife("hours");

  const now = new Date();
  const sort = p.sort === "growth" && p.range === RANGE_CLEAR_VALUE ? "currentPlaying" : p.sort;
  const { games, total } = await getGamesList({
    genreSlug: p.genreSlug,
    themeSlug: p.themeSlug,
    status: p.status,
    search: p.search,
    minPlaying: p.minPlaying,
    created: p.age ? ageToCreatedRange(p.age, now) : undefined,
    growthById: sort === "growth" ? await getGrowthById(p.range) : undefined,
    sort,
    order: p.order,
    limit: EXPORT_MAX_GAMES,
  });

  type Row = (typeof games)[number];
  const earnings = new Map(
    games.map((g) => [g.id, estimateDailyEarningsFromCcu(g.currentPlaying, now, g.passCatalog)]),
  );
  const notes = [
    ESTIMATE_NOTE,
    "est_earnings_* are USD per day from current players, placed within the range by the game's public game-pass prices when checked (est_earnings_pass_tier).",
  ];
  if (sort === "likeRatio") {
    notes.push(
      `Sorted by like ratio; only games with at least ${LIKE_RATIO_MIN_VOTES} votes are included.`,
    );
  } else if (sort === "growth") {
    notes.push(
      `Sorted by growth over ${p.range}: first-day vs last-day average players; only games averaging at least ${RISING.minBaseline} players at the start are included.`,
    );
  }
  if (total > games.length) {
    notes.push(`First ${games.length} of ${total} matching games, in the page's sort order.`);
  }
  return buildTable<Row>(
    "games",
    [
      { name: "universe_id", value: (g) => g.universeId.toString() },
      { name: "name", value: (g) => g.name },
      { name: "creator", value: (g) => g.creatorName },
      { name: "creator_type", value: (g) => g.creatorType },
      { name: "genre", value: (g) => g.currentGenre?.name ?? null },
      { name: "status", value: (g) => g.status },
      { name: "players", value: (g) => g.currentPlaying },
      { name: "all_time_peak_players", value: (g) => g.allTimePeakPlayers },
      { name: "visits", value: (g) => g.currentVisits.toString() },
      { name: "favorites", value: (g) => g.currentFavorites },
      { name: "up_votes", value: (g) => g.currentUpVotes },
      { name: "down_votes", value: (g) => g.currentDownVotes },
      { name: "created_on_roblox", value: (g) => iso(g.robloxCreatedAt) },
      { name: "last_updated_on_roblox", value: (g) => iso(g.robloxUpdatedAt) },
      { name: "first_tracked", value: (g) => iso(g.firstSeenAt) },
      { name: "last_collected", value: (g) => iso(g.lastSnapshotAt) },
      { name: "est_earnings_low_usd_per_day", value: (g) => usd(earnings.get(g.id)!.low) },
      { name: "est_earnings_high_usd_per_day", value: (g) => usd(earnings.get(g.id)!.high) },
      { name: "est_earnings_pass_tier", value: (g) => earnings.get(g.id)!.passTier ?? null },
      { name: "url", value: (g) => `/games/${g.universeId}` },
    ],
    games,
    notes,
  );
}

export async function getTrendingExport(
  kind: "games" | "genres",
  range: RangeKey,
): Promise<ExportTable> {
  "use cache";
  cacheLife("hours");

  const cutoff = rangeToCutoff(range);
  const rule = `Growth compares average players over the first ${RISING.avgWindowHours}h of the range with the last ${RISING.avgWindowHours}h; only series with a starting average of at least ${RISING.minBaseline} players that grew are listed.`;
  const growth = (r: { growthPct: number | null }) =>
    r.growthPct === null ? null : Math.round(r.growthPct * 10_000) / 10_000;

  if (kind === "games") {
    const rows = await getRisingGames({ cutoff, limit: EXPORT_TRENDING_ROWS });
    return buildTable(
      `trending-games-${range}`,
      [
        { name: "rank", value: (r) => rows.indexOf(r) + 1 },
        { name: "universe_id", value: (r) => r.universeId.toString() },
        { name: "name", value: (r) => r.name },
        { name: "genre", value: (r) => r.genreName },
        { name: "avg_players_start", value: (r) => Math.round(r.basePlaying) },
        { name: "avg_players_end", value: (r) => Math.round(r.currentPlaying) },
        { name: "growth_ratio", value: growth },
      ],
      rows,
      [rule, "growth_ratio is a fraction: 0.25 = +25%."],
    );
  }
  const rows = await getRisingGenres({ cutoff, limit: EXPORT_TRENDING_ROWS });
  return buildTable(
    `trending-genres-${range}`,
    [
      { name: "rank", value: (r) => rows.indexOf(r) + 1 },
      { name: "slug", value: (r) => r.slug },
      { name: "name", value: (r) => r.name },
      { name: "avg_players_start", value: (r) => Math.round(r.basePlaying) },
      { name: "avg_players_end", value: (r) => Math.round(r.currentPlaying) },
      { name: "growth_ratio", value: growth },
    ],
    rows,
    [rule, "growth_ratio is a fraction: 0.25 = +25%."],
  );
}

/** A game's raw snapshot history, oldest first; null for an unknown game. */
export async function getSnapshotsExport(
  universeId: string,
  range: RangeKey,
): Promise<ExportTable | null> {
  "use cache";
  cacheLife("hours");

  let id: bigint;
  try {
    id = BigInt(universeId);
  } catch {
    return null;
  }
  const game = await getGameByUniverseId(id);
  if (!game) return null;
  const snapshots = await getGameSnapshots(game.id, { from: rangeToCutoff(range) });
  return buildTable(
    `snapshots-${universeId}-${range}`,
    [
      { name: "collected_at", value: (s) => s.collectedAt.toISOString() },
      { name: "players", value: (s) => s.playing },
      { name: "visits", value: (s) => s.visits.toString() },
      { name: "favorites", value: (s) => s.favorites },
      { name: "up_votes", value: (s) => s.upVotes },
      { name: "down_votes", value: (s) => s.downVotes },
    ],
    snapshots,
    [
      `Raw readings for ${game.name} (universe ${universeId}) as collected from Roblox's public API. Times are UTC.`,
      "No data was collected from 2026-08-20 to 2026-09-29; gaps are missing readings, not zero players.",
    ],
  );
}
