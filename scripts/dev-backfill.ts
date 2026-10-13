/**
 * Dev-only: fill the LOCAL database with made-up snapshot history, so charts,
 * trends and sparklines have something to draw while working on the UI.
 *
 *   npm run dev:backfill
 *
 * Run `npm run collect` first: every game's real current reading is kept and
 * used as the end of its invented curve. Everything before that reading is
 * SYNTHETIC. It replaces all older GameSnapshot, GenreSnapshot and GameUpdate
 * rows and clears AnalyticsResult (re-run `npm run analytics` afterwards).
 *
 * Refuses to run against anything but a `file:` database. Never point this at
 * Turso: it would overwrite real, unrecoverable history with invented numbers.
 */
import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const RUN_INTERVAL_HOURS = 3;
/** Mirrors the real history: collection began here and paused for the outage. */
const HISTORY_START = Date.UTC(2026, 6, 16);
const OUTAGE_START = Date.UTC(2026, 7, 20);
const OUTAGE_END = Date.UTC(2026, 8, 29, 18);
const CHUNK = 500;

type Shape = "steady" | "rising" | "fading" | "volatile" | "launch" | "dying";

/** Small deterministic PRNG (mulberry32), so a re-run draws the same curves. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function pickShape(r: number): Shape {
  if (r < 0.34) return "steady";
  if (r < 0.52) return "rising";
  if (r < 0.7) return "fading";
  if (r < 0.82) return "volatile";
  if (r < 0.92) return "launch";
  return "dying";
}

/** Long-run level relative to the final reading; `p` runs 0 (start) → 1 (now). */
function trend(shape: Shape, p: number, strength: number): number {
  switch (shape) {
    case "steady":
      return 1 + (strength - 0.5) * 0.3 * (1 - p);
    case "rising":
      return 1 / (1 + strength * 4 * (1 - p) ** 1.5);
    case "fading":
      return 1 + strength * 5 * (1 - p) ** 1.3;
    case "volatile":
      return 1 + 0.5 * Math.sin(p * (6 + strength * 10)) * (1 - p * 0.5);
    case "launch":
      // Spike shortly after first seen, then settle toward the final level.
      return 1 + (2 + strength * 6) * Math.exp(-p * 9);
    case "dying":
      // Healthy for most of its life, then collapses under the dead rule's 5%.
      return p < 0.6 ? 30 + strength * 30 : Math.max(1, (30 + strength * 30) * (1 - (p - 0.6) * 4));
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) {
    console.error("Refusing to run: DATABASE_URL is not a local file: database.");
    process.exit(1);
  }

  const games = await prisma.game.findMany({
    where: { lastSnapshotAt: { not: null } },
    select: {
      id: true,
      currentPlaying: true,
      currentVisits: true,
      currentFavorites: true,
      currentUpVotes: true,
      currentDownVotes: true,
      currentGenreId: true,
      lastSnapshotAt: true,
    },
  });
  if (games.length === 0) {
    console.error("No collected games. Run `npm run collect` first.");
    process.exit(1);
  }

  // The newest real run anchors every curve; only rows before it are replaced.
  const anchor = Math.max(...games.map((g) => g.lastSnapshotAt!.getTime()));
  const cutoff = new Date(anchor - HOUR_MS);

  const times: number[] = [];
  for (let t = anchor - RUN_INTERVAL_HOURS * HOUR_MS; t >= HISTORY_START;) {
    if (t < OUTAGE_START || t >= OUTAGE_END) times.push(t);
    t -= RUN_INTERVAL_HOURS * HOUR_MS;
  }
  times.reverse();

  await prisma.gameSnapshot.deleteMany({ where: { collectedAt: { lt: cutoff } } });
  await prisma.genreSnapshot.deleteMany({ where: { collectedAt: { lt: cutoff } } });
  await prisma.gameUpdate.deleteMany({});
  await prisma.analyticsResult.deleteMany({});

  const maxPlayersByGame = new Map(
    (
      await prisma.gameSnapshot.findMany({
        where: { collectedAt: { gte: cutoff } },
        select: { gameId: true, maxPlayers: true },
      })
    ).map((s) => [s.gameId, s.maxPlayers]),
  );

  // Per run and genre: every game's players, for the genre points.
  const genrePoints = new Map<
    number,
    Map<string, { playing: number[]; visits: bigint; favorites: number }>
  >();
  const classified = new Map<string, number>();
  for (const g of games) {
    if (g.currentGenreId)
      classified.set(g.currentGenreId, (classified.get(g.currentGenreId) ?? 0) + 1);
  }

  let snapshotRows = 0;
  let updateRows = 0;

  for (const game of games) {
    const rand = rng(hash(game.id));
    const shape = pickShape(rand());
    const strength = rand();
    const sessionHours = 0.15 + rand() * 0.5;
    const peakHour = Math.floor(rand() * 24);
    const noise = shape === "volatile" ? 0.25 : 0.08;
    // Launches and some others were first seen part-way through the history.
    const firstSeen =
      shape === "launch"
        ? anchor - (3 + rand() * 11) * DAY_MS
        : rand() < 0.25
          ? HISTORY_START + rand() * 20 * DAY_MS
          : HISTORY_START;
    const own = times.filter((t) => t >= firstSeen);
    if (own.length === 0) continue;

    // A dying game ends dead: its real last reading is scaled down to match.
    const endPlaying =
      shape === "dying" ? Math.max(0, Math.round(game.currentPlaying / 40)) : game.currentPlaying;
    const base = Math.max(shape === "dying" ? game.currentPlaying / 40 : game.currentPlaying, 1);
    const spikeAt = rand() < 0.3 ? Math.floor(rand() * own.length) : -1;

    const span = Math.max(anchor - own[0], 1);
    const playing = own.map((t, i) => {
      const p = (t - own[0]) / span;
      const hour = new Date(t).getUTCHours();
      const weekday = new Date(t).getUTCDay();
      const daily = 1 + 0.35 * Math.cos(((hour - peakHour) / 24) * 2 * Math.PI);
      const weekly = weekday === 0 || weekday === 6 ? 1.18 : 1;
      const jitter = 1 + (rand() - 0.5) * 2 * noise;
      const spike = spikeAt >= 0 && i >= spikeAt && i < spikeAt + 6 ? 1.8 : 1;
      return Math.max(
        0,
        Math.round(base * trend(shape, p, strength) * daily * weekly * jitter * spike),
      );
    });

    // Visits only ever go up, so walk back from the real counter.
    const visits: bigint[] = new Array(own.length);
    let running = game.currentVisits;
    for (let i = own.length - 1; i >= 0; i--) {
      const joined = BigInt(Math.round((playing[i] * RUN_INTERVAL_HOURS) / sessionHours));
      running = running > joined ? running - joined : BigInt(0);
      visits[i] = running;
    }
    const totalJoined = Number(game.currentVisits - visits[0]) || 1;
    const earlier = (now: number, i: number) => {
      // Counters grow with visits; assume up to half arrived inside the history.
      const share = Number(game.currentVisits - visits[i]) / totalJoined;
      return Math.max(0, Math.round(now * (1 - 0.5 * share)));
    };

    const rows = own.map((t, i) => ({
      gameId: game.id,
      collectedAt: new Date(t),
      playing: playing[i],
      visits: visits[i],
      favorites: earlier(game.currentFavorites, i),
      upVotes: earlier(game.currentUpVotes, i),
      downVotes: earlier(game.currentDownVotes, i),
      maxPlayers: maxPlayersByGame.get(game.id) ?? null,
    }));
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma.gameSnapshot.createMany({ data: rows.slice(i, i + CHUNK) });
    }
    snapshotRows += rows.length;

    if (game.currentGenreId) {
      own.forEach((t, i) => {
        const perGenre = genrePoints.get(t) ?? new Map();
        const entry = perGenre.get(game.currentGenreId!) ?? {
          playing: [],
          visits: BigInt(0),
          favorites: 0,
        };
        entry.playing.push(playing[i]);
        entry.visits += visits[i];
        entry.favorites += rows[i].favorites;
        perGenre.set(game.currentGenreId!, entry);
        genrePoints.set(t, perGenre);
      });
    }

    // A handful of updates per game, oldest first, each pointing at the last.
    const updateTimes = Array.from({ length: Math.floor(rand() * 6) }, () =>
      Math.floor(rand() * own.length),
    )
      .filter((v, i, all) => all.indexOf(v) === i)
      .sort((a, b) => a - b);
    let previous: Date | null = null;
    for (const index of updateTimes) {
      const updatedAt = new Date(own[index] - Math.floor(rand() * 2 * HOUR_MS));
      await prisma.gameUpdate.create({
        data: {
          gameId: game.id,
          updatedAt,
          previousUpdatedAt: previous,
          detectedAt: new Date(own[index]),
        },
      });
      previous = updatedAt;
      updateRows++;
    }

    let peak = endPlaying;
    let peakAt = new Date(anchor);
    playing.forEach((value, i) => {
      if (value > peak) {
        peak = value;
        peakAt = new Date(own[i]);
      }
    });
    await prisma.game.update({
      where: { id: game.id },
      data: {
        firstSeenAt: new Date(own[0]),
        allTimePeakPlayers: peak,
        allTimePeakAt: peakAt,
        ...(shape === "dying" ? { currentPlaying: endPlaying } : {}),
      },
    });
    if (shape === "dying") {
      await prisma.gameSnapshot.updateMany({
        where: { gameId: game.id, collectedAt: { gte: cutoff } },
        data: { playing: endPlaying },
      });
    }
  }

  const genreRows = [...genrePoints].flatMap(([t, perGenre]) =>
    [...perGenre].map(([genreId, entry]) => {
      const sorted = [...entry.playing].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const totalPlaying = sorted.reduce((a, b) => a + b, 0);
      return {
        genreId,
        collectedAt: new Date(t),
        totalGames: sorted.length,
        totalPlaying,
        totalVisits: entry.visits,
        totalFavorites: BigInt(entry.favorites),
        avgPlaying: totalPlaying / sorted.length,
        medianPlaying: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
        coverage: sorted.length / (classified.get(genreId) ?? sorted.length),
      };
    }),
  );
  for (let i = 0; i < genreRows.length; i += CHUNK) {
    await prisma.genreSnapshot.createMany({ data: genreRows.slice(i, i + CHUNK) });
  }

  console.log(
    `Synthetic history written for ${games.length} games: ${snapshotRows} game snapshots, ` +
      `${genreRows.length} genre snapshots, ${updateRows} updates. ` +
      "Now run `npm run analytics`.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
