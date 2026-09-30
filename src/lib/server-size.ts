/**
 * Server size by genre (Task #91): the typical `maxPlayers` (players per
 * server, set by the developer) of a genre's games, and how it relates to how
 * many people play them. Pure, so it's tested without a database.
 */

import { quantile } from "@/lib/new-releases";

export const SERVER_SIZE = {
  /** A game counts as "busy" from this many players now. */
  busyPlayers: 100,
  /** Games with players needed before a rank correlation is shown. */
  minCorrelationGames: 10,
} as const;

export interface ServerSizeGame {
  genreId: string | null;
  maxPlayers: number;
  playing: number;
}

export interface ServerSize {
  games: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** Median over games with SERVER_SIZE.busyPlayers+ players now. */
  medianBusy: number | null;
  busyGames: number;
  /** Spearman rank correlation of server size with players now, over games with players. */
  spearman: number | null;
  spearmanGames: number;
}

/** Ranks from 1, ties sharing their average rank. */
export function averageRanks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = rank;
    i = j + 1;
  }
  return ranks;
}

/** Spearman's rho (Pearson on average ranks); null when either side is constant. */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const rx = averageRanks(xs);
  const ry = averageRanks(ys);
  const mean = (n + 1) / 2;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mean;
    const dy = ry[i] - mean;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

export function summarizeServerSize(games: ServerSizeGame[]): ServerSize {
  const sizes = games.map((g) => g.maxPlayers).sort((a, b) => a - b);
  const busy = games
    .filter((g) => g.playing >= SERVER_SIZE.busyPlayers)
    .map((g) => g.maxPlayers)
    .sort((a, b) => a - b);
  const playingGames = games.filter((g) => g.playing > 0);
  return {
    games: sizes.length,
    median: sizes.length ? quantile(sizes, 0.5) : null,
    p25: sizes.length ? quantile(sizes, 0.25) : null,
    p75: sizes.length ? quantile(sizes, 0.75) : null,
    medianBusy: busy.length ? quantile(busy, 0.5) : null,
    busyGames: busy.length,
    spearman:
      playingGames.length >= SERVER_SIZE.minCorrelationGames
        ? spearman(
            playingGames.map((g) => g.maxPlayers),
            playingGames.map((g) => g.playing),
          )
        : null,
    spearmanGames: playingGames.length,
  };
}

/** Server size per genre id, games without a genre left out. */
export function serverSizeByGenre(games: ServerSizeGame[]): Record<string, ServerSize> {
  const byGenre = new Map<string, ServerSizeGame[]>();
  for (const g of games) {
    if (!g.genreId) continue;
    const list = byGenre.get(g.genreId) ?? [];
    list.push(g);
    byGenre.set(g.genreId, list);
  }
  return Object.fromEntries([...byGenre].map(([id, list]) => [id, summarizeServerSize(list)]));
}
