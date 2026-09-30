import { prisma } from "@/lib/prisma";
import {
  EMPTY_SESSION_SUMS,
  SESSION_ESTIMATE,
  addSessionSums,
  favoritesPer1kVisits,
  likeRatio,
  sessionMinutes,
  sumSessionPairs,
  type EngagementReading,
} from "@/lib/engagement";
import { LIKE_RATIO_MIN_VOTES } from "@/lib/games-list";
import { serverSizeByGenre, type ServerSize, type ServerSizeGame } from "@/lib/server-size";

export interface GameSession {
  id: string;
  minutes: number;
}

export interface GenreEngagement {
  genreId: string;
  /** Est. minutes per visit over the genre's counted readings. */
  sessionMinutes: number | null;
  /** Games whose own readings contributed. */
  sessionGames: number;
  favoritesPer1k: number | null;
  likeRatio: number | null;
}

export interface EngagementIndex {
  /** Latest reading the window ends at (ISO), or null with no snapshots. */
  windowEnd: string | null;
  games: GameSession[];
  genres: GenreEngagement[];
  /** Server size (maxPlayers) per genre id, from each game's latest reading in the window (Task #91). */
  serverSize: Record<string, ServerSize>;
}

/**
 * Est. session length for every game and genre, plus each genre's favorites
 * per 1K visits and like ratio (Task #82). Three reads: the latest snapshot
 * time (one index seek), the snapshots of the last SESSION_ESTIMATE.windowHours
 * (a range on the collectedAt index; ~a day of readings, about 30K rows at 7K
 * games), and every game's genre and cumulative counters. Callers cache it:
 * every page that shows these shares one computation. The same day of readings
 * also gives each game's latest server size (Task #91), so that costs no reads.
 */
export async function getEngagementIndex(): Promise<EngagementIndex> {
  const latest = await prisma.gameSnapshot.aggregate({ _max: { collectedAt: true } });
  const end = latest._max.collectedAt;
  if (!end) return { windowEnd: null, games: [], genres: [], serverSize: {} };
  const from = new Date(end.getTime() - SESSION_ESTIMATE.windowHours * 3_600_000);

  const [snapshots, games] = await Promise.all([
    prisma.gameSnapshot.findMany({
      where: { collectedAt: { gte: from } },
      select: { gameId: true, collectedAt: true, playing: true, visits: true, maxPlayers: true },
    }),
    prisma.game.findMany({
      select: {
        id: true,
        currentGenreId: true,
        currentFavorites: true,
        currentVisits: true,
        currentUpVotes: true,
        currentDownVotes: true,
        currentPlaying: true,
      },
    }),
  ]);

  const readings = new Map<string, EngagementReading[]>();
  const latestSize = new Map<string, { t: number; maxPlayers: number }>();
  for (const s of snapshots) {
    const list = readings.get(s.gameId) ?? [];
    list.push({ t: s.collectedAt.getTime(), playing: s.playing, visits: Number(s.visits) });
    readings.set(s.gameId, list);
    const t = s.collectedAt.getTime();
    if (s.maxPlayers && s.maxPlayers > 0 && t >= (latestSize.get(s.gameId)?.t ?? -Infinity)) {
      latestSize.set(s.gameId, { t, maxPlayers: s.maxPlayers });
    }
  }

  const sizes: ServerSizeGame[] = [];
  const sessions: GameSession[] = [];
  const byGenre = new Map<
    string,
    {
      sums: typeof EMPTY_SESSION_SUMS;
      sessionGames: number;
      favorites: number;
      visits: number;
      up: number;
      down: number;
    }
  >();
  for (const g of games) {
    const sums = sumSessionPairs(readings.get(g.id) ?? []);
    const minutes = sessionMinutes(sums);
    if (minutes !== null) sessions.push({ id: g.id, minutes });
    const size = latestSize.get(g.id);
    if (size) {
      sizes.push({
        genreId: g.currentGenreId,
        maxPlayers: size.maxPlayers,
        playing: g.currentPlaying,
      });
    }
    if (!g.currentGenreId) continue;
    const entry = byGenre.get(g.currentGenreId) ?? {
      sums: EMPTY_SESSION_SUMS,
      sessionGames: 0,
      favorites: 0,
      visits: 0,
      up: 0,
      down: 0,
    };
    if (sums.hours > 0) {
      entry.sums = addSessionSums(entry.sums, sums);
      entry.sessionGames++;
    }
    entry.favorites += g.currentFavorites;
    entry.visits += Number(g.currentVisits);
    entry.up += g.currentUpVotes;
    entry.down += g.currentDownVotes;
    byGenre.set(g.currentGenreId, entry);
  }

  return {
    windowEnd: end.toISOString(),
    games: sessions,
    genres: [...byGenre].map(([genreId, e]) => ({
      genreId,
      // A genre's sums pool many games' pairs, so the covered-hours floor is
      // judged on the average game's coverage instead of the pooled total.
      sessionMinutes:
        e.sessionGames > 0
          ? sessionMinutes({ ...e.sums, hours: e.sums.hours / e.sessionGames })
          : null,
      sessionGames: e.sessionGames,
      favoritesPer1k: favoritesPer1kVisits(e.favorites, e.visits),
      likeRatio: likeRatio(e.up, e.down, LIKE_RATIO_MIN_VOTES),
    })),
    serverSize: serverSizeByGenre(sizes),
  };
}
