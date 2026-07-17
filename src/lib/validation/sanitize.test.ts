import { describe, it, expect } from "vitest";

import type { RobloxGameDetail, RobloxGameVotes, RobloxSearchGame } from "@/lib/roblox/types";
import {
  sanitizeGameDetails,
  sanitizeGameVotes,
  sanitizeSearchGames,
  mergeGameData,
} from "./sanitize";

/**
 * This layer is the only thing standing between Roblox's semi-official,
 * unversioned API and the DB. Every test here is a specific way real responses
 * have been known to go wrong — a row that slips through poisons the snapshot
 * history permanently, since bad points can't be re-fetched later.
 */

// BigInt via the constructor, not `123n` literals — the project targets ES2017,
// which predates BigInt literal syntax, so all app code writes them this way too.
function detail(over: Partial<RobloxGameDetail> = {}): RobloxGameDetail {
  return {
    id: 123,
    rootPlaceId: 456,
    name: "Test Game",
    description: "A game",
    creator: { id: 1, name: "Dev", type: "User", hasVerifiedBadge: false },
    price: null,
    playing: 100,
    visits: 5000,
    maxPlayers: 50,
    created: "2024-01-01T00:00:00Z",
    updated: "2024-06-01T00:00:00Z",
    genre: "All",
    genre_l1: "Simulation",
    genre_l2: "Idle Simulator",
    favoritedCount: 10,
    ...over,
  };
}

function searchGame(over: Partial<RobloxSearchGame> = {}): RobloxSearchGame {
  return {
    universeId: 1,
    rootPlaceId: 2,
    name: "Found Game",
    description: "",
    playerCount: 0,
    totalUpVotes: 0,
    totalDownVotes: 0,
    creatorName: "Dev",
    creatorId: 1,
    creatorHasVerifiedBadge: false,
    canonicalUrlPath: "/games/2",
    ...over,
  };
}

describe("sanitizeGameDetails", () => {
  it("passes a well-formed detail through", () => {
    const result = sanitizeGameDetails([detail()]);
    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects a negative player count", () => {
    const result = sanitizeGameDetails([detail({ playing: -5 })]);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0].reasons.join()).toMatch(/playing/);
  });

  it("rejects a blank or whitespace-only name", () => {
    expect(sanitizeGameDetails([detail({ name: "" })]).valid).toHaveLength(0);
    expect(sanitizeGameDetails([detail({ name: "   " })]).valid).toHaveLength(0);
  });

  it("rejects a non-positive id", () => {
    expect(sanitizeGameDetails([detail({ id: 0 })]).valid).toHaveLength(0);
    expect(sanitizeGameDetails([detail({ id: -1 })]).valid).toHaveLength(0);
  });

  it("rejects an unparseable timestamp", () => {
    const result = sanitizeGameDetails([detail({ created: "not a date" })]);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0].reasons.join()).toMatch(/ISO date/);
  });

  it("rejects updated-before-created as internally inconsistent", () => {
    const result = sanitizeGameDetails([
      detail({ created: "2024-06-01T00:00:00Z", updated: "2024-01-01T00:00:00Z" }),
    ]);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0].reasons.join()).toMatch(/before/);
  });

  it("accepts equal created/updated timestamps (a never-updated game)", () => {
    const t = "2024-01-01T00:00:00Z";
    expect(sanitizeGameDetails([detail({ created: t, updated: t })]).valid).toHaveLength(1);
  });

  it("accepts a null description and null genres", () => {
    // Genuinely optional on Roblox's side — not a reason to drop a snapshot.
    const result = sanitizeGameDetails([
      detail({ description: null, genre: null, genre_l1: null, genre_l2: null }),
    ]);
    expect(result.valid).toHaveLength(1);
  });

  it("rejects a non-integer player count", () => {
    expect(sanitizeGameDetails([detail({ playing: 1.5 })]).valid).toHaveLength(0);
  });

  it("dedupes by id, keeping the first occurrence", () => {
    const result = sanitizeGameDetails([
      detail({ id: 1, name: "First" }),
      detail({ id: 1, name: "Second" }),
      detail({ id: 2, name: "Other" }),
    ]);
    expect(result.valid.map((g) => g.name)).toEqual(["First", "Other"]);
    expect(result.duplicates).toHaveLength(1);
  });

  it("reports each bad row's reason alongside the surviving good rows", () => {
    // The collector logs these (Task #34) — a silent drop would hide API drift.
    const result = sanitizeGameDetails([detail({ id: 1 }), detail({ id: 2, playing: -1 })]);
    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].input.id).toBe(2);
    expect(result.rejected[0].reasons.length).toBeGreaterThan(0);
  });

  it("returns empty results for an empty input", () => {
    expect(sanitizeGameDetails([])).toEqual({ valid: [], rejected: [], duplicates: [] });
  });
});

describe("sanitizeGameVotes", () => {
  it("passes valid votes and rejects negative ones", () => {
    const ok: RobloxGameVotes = { id: 1, upVotes: 10, downVotes: 2 };
    expect(sanitizeGameVotes([ok]).valid).toHaveLength(1);
    expect(sanitizeGameVotes([{ ...ok, downVotes: -1 }]).valid).toHaveLength(0);
  });
});

describe("sanitizeSearchGames", () => {
  it("rejects a blank name and a non-positive universeId", () => {
    expect(sanitizeSearchGames([searchGame({ name: "" })]).valid).toHaveLength(0);
    expect(sanitizeSearchGames([searchGame({ universeId: 0 })]).valid).toHaveLength(0);
  });

  it("accepts a zero playerCount and rootPlaceId", () => {
    // A discovered game with nobody in it right now is still worth tracking —
    // that's the survivorship-bias guard working as intended.
    expect(
      sanitizeSearchGames([searchGame({ rootPlaceId: 0, playerCount: 0 })]).valid,
    ).toHaveLength(1);
  });
});

describe("mergeGameData", () => {
  const votes: RobloxGameVotes = { id: 123, upVotes: 90, downVotes: 10 };

  it("merges details + votes into one DB-ready record", () => {
    const { games, warnings } = mergeGameData([detail()], [votes]);
    expect(warnings).toHaveLength(0);
    expect(games[0]).toMatchObject({
      universeId: BigInt(123),
      rootPlaceId: BigInt(456),
      name: "Test Game",
      creatorId: BigInt(1),
      creatorType: "User",
      playing: 100,
      visits: BigInt(5000),
      favorites: 10,
      upVotes: 90,
      downVotes: 10,
    });
  });

  it("keeps a game whose votes are missing, defaulting to 0/0 with a warning", () => {
    // Deliberate: dropping an otherwise-good snapshot over a secondary endpoint
    // hiccup would leave a permanent hole in the history the collector exists
    // to build.
    const { games, warnings } = mergeGameData([detail()], []);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ upVotes: 0, downVotes: 0 });
    expect(warnings).toEqual([
      { universeId: 123, message: expect.stringMatching(/missing votes/) },
    ]);
  });

  it("orders genre signals most-specific first and drops nulls", () => {
    // The taxonomy resolver takes the first match, so l2 must beat l1 must beat
    // the legacy thematic genre.
    const { games } = mergeGameData([detail()], [votes]);
    expect(games[0].genreSignals).toEqual(["Idle Simulator", "Simulation", "All"]);

    const sparse = mergeGameData([detail({ genre_l2: null, genre_l1: null })], [votes]);
    expect(sparse.games[0].genreSignals).toEqual(["All"]);

    const none = mergeGameData([detail({ genre: null, genre_l1: null, genre_l2: null })], [votes]);
    expect(none.games[0].genreSignals).toEqual([]);
  });

  it("converts ids and visits to BigInt", () => {
    const { games } = mergeGameData([detail()], [votes]);
    expect(typeof games[0].universeId).toBe("bigint");
    expect(typeof games[0].visits).toBe("bigint");
  });

  it("parses timestamps into Dates", () => {
    const { games } = mergeGameData([detail()], [votes]);
    expect(games[0].robloxCreatedAt).toBeInstanceOf(Date);
    expect(games[0].robloxCreatedAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });

  it("matches votes to the right game when several are merged", () => {
    const { games, warnings } = mergeGameData(
      [detail({ id: 1 }), detail({ id: 2 })],
      [
        { id: 2, upVotes: 7, downVotes: 3 },
        { id: 1, upVotes: 5, downVotes: 1 },
      ],
    );
    expect(games.find((g) => g.universeId === BigInt(1))).toMatchObject({
      upVotes: 5,
      downVotes: 1,
    });
    expect(games.find((g) => g.universeId === BigInt(2))).toMatchObject({
      upVotes: 7,
      downVotes: 3,
    });
    expect(warnings).toHaveLength(0);
  });
});
