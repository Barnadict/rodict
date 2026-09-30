/**
 * Update frequency (Task #88): how often games change, per genre, which games
 * change most, and (associational, like the #26 correlations) how update
 * cadence lines up with player growth. Pure, so it's tested without a database.
 *
 * Two sources with different coverage:
 *  - Game.robloxUpdatedAt covers every tracked game, so "updated in the last 30
 *    days" and "days since the last update" are complete.
 *  - GameUpdate rows (Task #63) only exist from when update tracking started,
 *    and only as often as a game is collected (quiet games daily), so several
 *    updates in one day count once, and updates during a collection pause
 *    collapse into one row whose previous timestamp is far back. Intervals and
 *    counts from them are lower bounds on how often games update.
 */

import { quantile } from "@/lib/new-releases";

export const CADENCE = {
  /** Window for "updated recently", update counts and the growth comparison. */
  recentDays: 30,
  /** GameUpdate rows read, by their update time. */
  historyDays: 90,
  /** Games listed per genre / site-wide as most frequently updated. */
  topPerGenre: 5,
  topOverall: 25,
  /** Games a cadence bucket needs before its median growth is shown. */
  minBucketGames: 10,
} as const;

/** Cadence buckets by updates in the last CADENCE.recentDays days. */
export const CADENCE_BUCKETS = [
  { label: "No updates", min: 0, max: 0 },
  { label: "1 update", min: 1, max: 1 },
  { label: "2–3 updates", min: 2, max: 3 },
  { label: "4+ updates", min: 4, max: Infinity },
] as const;

export interface CadenceGame {
  id: string;
  universeId: string;
  name: string;
  genreId: string | null;
  currentPlaying: number;
  robloxUpdatedAt: Date | null;
}

export interface CadenceChange {
  gameId: string;
  updatedAt: Date;
  /** The timestamp it replaced; rows without one (first sighting) aren't changes. */
  previousUpdatedAt: Date;
}

export interface GenreCadence {
  genreId: string;
  games: number;
  /** Share of the genre's games (0–1) whose last update is within the window. */
  updatedRecentlyShare: number | null;
  medianDaysSinceUpdate: number | null;
  /** Median over games of each game's median days between recorded updates. */
  medianDaysBetween: number | null;
  /** Games with at least one recorded interval. */
  intervalGames: number;
  /** Recorded updates in the window. */
  recentUpdates: number;
}

export interface TopUpdater {
  id: string;
  universeId: string;
  name: string;
  genreId: string | null;
  currentPlaying: number;
  /** Recorded updates in the window. */
  updates: number;
}

export interface CadenceBucket {
  label: string;
  games: number;
  /** Games with a growth figure. */
  withGrowth: number;
  medianGrowth: number | null;
  shareUp: number | null;
}

export interface UpdateCadence {
  recentDays: number;
  /** Earliest recorded change (ISO), i.e. roughly when tracking started. */
  trackedSince: string | null;
  all: Omit<GenreCadence, "genreId">;
  genres: GenreCadence[];
  top: TopUpdater[];
  topByGenre: Record<string, TopUpdater[]>;
  buckets: CadenceBucket[];
}

const DAY_MS = 86_400_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}

/** Days between each change and the one before it, from both timestamps. */
function intervalsOf(changes: CadenceChange[]): number[] {
  return changes
    .map((c) => (c.updatedAt.getTime() - c.previousUpdatedAt.getTime()) / DAY_MS)
    .filter((d) => d > 0);
}

function genreCadence(
  games: CadenceGame[],
  changesByGame: Map<string, CadenceChange[]>,
  recentFrom: number,
  now: number,
): Omit<GenreCadence, "genreId"> {
  const withUpdate = games.filter((g) => g.robloxUpdatedAt);
  const sinceDays = withUpdate.map((g) => (now - g.robloxUpdatedAt!.getTime()) / DAY_MS);
  const perGame: number[] = [];
  let recentUpdates = 0;
  for (const g of games) {
    const changes = changesByGame.get(g.id) ?? [];
    const m = median(intervalsOf(changes));
    if (m !== null) perGame.push(m);
    recentUpdates += changes.filter((c) => c.updatedAt.getTime() >= recentFrom).length;
  }
  return {
    games: games.length,
    updatedRecentlyShare: withUpdate.length
      ? withUpdate.filter((g) => g.robloxUpdatedAt!.getTime() >= recentFrom).length /
        withUpdate.length
      : null,
    medianDaysSinceUpdate: median(sinceDays),
    medianDaysBetween: median(perGame),
    intervalGames: perGame.length,
    recentUpdates,
  };
}

/**
 * Everything the update-cadence views show. `growth` is each game's player
 * change over the same recent window (the /trending rule), for the
 * cadence-vs-growth buckets; games without a figure are counted but not measured.
 */
export function summarizeCadence(
  games: CadenceGame[],
  changes: CadenceChange[],
  growth: Map<string, number>,
  now: Date,
): UpdateCadence {
  const nowMs = now.getTime();
  const recentFrom = nowMs - CADENCE.recentDays * DAY_MS;

  const changesByGame = new Map<string, CadenceChange[]>();
  let trackedSince: number | null = null;
  for (const c of changes) {
    const list = changesByGame.get(c.gameId) ?? [];
    list.push(c);
    changesByGame.set(c.gameId, list);
    const t = c.updatedAt.getTime();
    if (trackedSince === null || t < trackedSince) trackedSince = t;
  }

  const byGenre = new Map<string, CadenceGame[]>();
  for (const g of games) {
    if (!g.genreId) continue;
    const list = byGenre.get(g.genreId) ?? [];
    list.push(g);
    byGenre.set(g.genreId, list);
  }

  const recentCount = (id: string) =>
    (changesByGame.get(id) ?? []).filter((c) => c.updatedAt.getTime() >= recentFrom).length;
  const updaters: TopUpdater[] = games
    .map((g) => ({
      id: g.id,
      universeId: g.universeId,
      name: g.name,
      genreId: g.genreId,
      currentPlaying: g.currentPlaying,
      updates: recentCount(g.id),
    }))
    .filter((g) => g.updates > 0)
    .sort((a, b) => b.updates - a.updates || b.currentPlaying - a.currentPlaying);

  const topByGenre: Record<string, TopUpdater[]> = {};
  for (const u of updaters) {
    if (!u.genreId) continue;
    const list = (topByGenre[u.genreId] ??= []);
    if (list.length < CADENCE.topPerGenre) list.push(u);
  }

  const buckets: CadenceBucket[] = CADENCE_BUCKETS.map((b) => {
    const members = games.filter((g) => {
      const n = recentCount(g.id);
      return n >= b.min && n <= b.max;
    });
    const measured = members.flatMap((g) => (growth.has(g.id) ? [growth.get(g.id)!] : []));
    const enough = measured.length >= CADENCE.minBucketGames;
    return {
      label: b.label,
      games: members.length,
      withGrowth: measured.length,
      medianGrowth: enough ? median(measured) : null,
      shareUp: enough ? measured.filter((v) => v > 0).length / measured.length : null,
    };
  });

  return {
    recentDays: CADENCE.recentDays,
    trackedSince: trackedSince === null ? null : new Date(trackedSince).toISOString(),
    all: genreCadence(games, changesByGame, recentFrom, nowMs),
    genres: [...byGenre].map(([genreId, list]) => ({
      genreId,
      ...genreCadence(list, changesByGame, recentFrom, nowMs),
    })),
    top: updaters.slice(0, CADENCE.topOverall),
    topByGenre,
    buckets,
  };
}
