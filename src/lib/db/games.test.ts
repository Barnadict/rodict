import { describe, it, expect } from "vitest";

import { planGameWrite, type ExistingGameRef } from "./games";
import type { CleanGame } from "@/lib/validation/sanitize";

/**
 * planGameWrite is the only non-mechanical part of the bulk collector write:
 * everything else in persistCollectedGames is row-building around these three
 * booleans. They drive the all-time-peak roll (which the "dead game" rule
 * depends on) and genre-history transitions, so a wrong flag corrupts the very
 * history the collector exists to build. Hence they're pinned here.
 */

function cleanGame(overrides: Partial<CleanGame> = {}): CleanGame {
  return {
    universeId: BigInt(1),
    rootPlaceId: BigInt(2),
    name: "Test Game",
    description: null,
    creatorId: BigInt(3),
    creatorName: "Creator",
    creatorType: "User",
    robloxCreatedAt: new Date("2024-01-01T00:00:00Z"),
    robloxUpdatedAt: new Date("2024-06-01T00:00:00Z"),
    genreSignals: [],
    playing: 100,
    visits: BigInt(1000),
    favorites: 10,
    upVotes: 5,
    downVotes: 1,
    maxPlayers: 50,
    ...overrides,
  };
}

const existing = (overrides: Partial<ExistingGameRef> = {}): ExistingGameRef => ({
  id: "game_1",
  allTimePeakPlayers: 0,
  currentGenreId: null,
  ...overrides,
});

describe("planGameWrite — isNew", () => {
  it("is new when there is no existing row", () => {
    expect(planGameWrite({ game: cleanGame(), genreId: null }, undefined).isNew).toBe(true);
  });

  it("is not new when an existing row is passed", () => {
    expect(planGameWrite({ game: cleanGame(), genreId: null }, existing()).isNew).toBe(false);
  });
});

describe("planGameWrite — peakUpdated", () => {
  it("rolls the peak for a brand-new game with any players (peak starts at 0)", () => {
    expect(
      planGameWrite({ game: cleanGame({ playing: 1 }), genreId: null }, undefined).peakUpdated,
    ).toBe(true);
  });

  it("does not roll the peak for a new game sitting at zero players", () => {
    expect(
      planGameWrite({ game: cleanGame({ playing: 0 }), genreId: null }, undefined).peakUpdated,
    ).toBe(false);
  });

  it("rolls the peak only when the current CCU strictly exceeds the stored peak", () => {
    expect(
      planGameWrite(
        { game: cleanGame({ playing: 500 }), genreId: null },
        existing({ allTimePeakPlayers: 400 }),
      ).peakUpdated,
    ).toBe(true);
    expect(
      planGameWrite(
        { game: cleanGame({ playing: 400 }), genreId: null },
        existing({ allTimePeakPlayers: 400 }),
      ).peakUpdated,
    ).toBe(false);
    expect(
      planGameWrite(
        { game: cleanGame({ playing: 399 }), genreId: null },
        existing({ allTimePeakPlayers: 400 }),
      ).peakUpdated,
    ).toBe(false);
  });
});

describe("planGameWrite — genreChanged", () => {
  it("is false when the game could not be classified (genreId null)", () => {
    expect(planGameWrite({ game: cleanGame(), genreId: null }, undefined).genreChanged).toBe(false);
    expect(
      planGameWrite({ game: cleanGame(), genreId: null }, existing({ currentGenreId: "g1" }))
        .genreChanged,
    ).toBe(false);
  });

  it("opens the first assignment for a new game that resolved a genre", () => {
    expect(planGameWrite({ game: cleanGame(), genreId: "g1" }, undefined).genreChanged).toBe(true);
  });

  it("is true when the resolved genre differs from the stored one", () => {
    expect(
      planGameWrite({ game: cleanGame(), genreId: "g2" }, existing({ currentGenreId: "g1" }))
        .genreChanged,
    ).toBe(true);
  });

  it("is false when the resolved genre matches the stored one", () => {
    expect(
      planGameWrite({ game: cleanGame(), genreId: "g1" }, existing({ currentGenreId: "g1" }))
        .genreChanged,
    ).toBe(false);
  });
});
