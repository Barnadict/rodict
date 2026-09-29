import { describe, expect, it } from "vitest";

import {
  GENRE_CARRY_MAX_AGE_HOURS,
  aggregateGenreSnapshots,
  type GenreAggregateInput,
} from "./genre-snapshots";

const RUN = new Date("2026-10-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(RUN.getTime() - h * 3_600_000);

function game(overrides: Partial<GenreAggregateInput> = {}): GenreAggregateInput {
  return {
    currentGenreId: "sim",
    currentPlaying: 100,
    currentVisits: BigInt(1000),
    currentFavorites: 10,
    lastSnapshotAt: RUN,
    ...overrides,
  };
}

describe("aggregateGenreSnapshots", () => {
  it("sums games collected this run and quiet games carried from their daily reading", () => {
    const [sim] = aggregateGenreSnapshots(
      [game({ currentPlaying: 300 }), game({ currentPlaying: 20, lastSnapshotAt: hoursAgo(21) })],
      RUN,
    );
    expect(sim.totalGames).toBe(2);
    expect(sim.totalPlaying).toBe(320);
    expect(sim.totalVisits).toBe(BigInt(2000));
    expect(sim.totalFavorites).toBe(BigInt(20));
    expect(sim.avgPlaying).toBe(160);
    expect(sim.medianPlaying).toBe(160);
    expect(sim.coverage).toBe(1);
  });

  it("leaves out readings older than the carry limit and lowers coverage", () => {
    const [sim] = aggregateGenreSnapshots(
      [
        game({ currentPlaying: 300 }),
        game({ currentPlaying: 50, lastSnapshotAt: hoursAgo(GENRE_CARRY_MAX_AGE_HOURS) }),
        game({ currentPlaying: 999, lastSnapshotAt: hoursAgo(GENRE_CARRY_MAX_AGE_HOURS + 1) }),
        game({ currentPlaying: 999, lastSnapshotAt: null }),
      ],
      RUN,
    );
    expect(sim.totalGames).toBe(2);
    expect(sim.totalPlaying).toBe(350);
    expect(sim.coverage).toBe(0.5);
  });

  it("ignores readings newer than the run (another run finished in between)", () => {
    const [sim] = aggregateGenreSnapshots(
      [game({ currentPlaying: 10 }), game({ currentPlaying: 999, lastSnapshotAt: hoursAgo(-1) })],
      RUN,
    );
    expect(sim.totalPlaying).toBe(10);
    expect(sim.coverage).toBe(0.5);
  });

  it("writes no point for a genre with nothing recent enough", () => {
    const out = aggregateGenreSnapshots(
      [game(), game({ currentGenreId: "obby", lastSnapshotAt: hoursAgo(100) })],
      RUN,
    );
    expect(out.map((g) => g.genreId)).toEqual(["sim"]);
  });

  it("carries a daily-collected game across a whole day of 3-hourly runs", () => {
    // Collected once at hour 0, then eight runs follow before its next collection.
    const collected = new Date(RUN.getTime() - 24 * 3_600_000);
    for (let h = 0; h <= 24; h += 3) {
      const run = new Date(collected.getTime() + h * 3_600_000);
      const [sim] = aggregateGenreSnapshots([game({ lastSnapshotAt: collected })], run);
      expect(sim?.totalGames).toBe(1);
    }
  });
});
