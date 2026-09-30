import { describe, expect, it } from "vitest";

import {
  HIT_PEAK_PLAYERS,
  creatorPath,
  parseCreatorParam,
  summarizeCreator,
  type CreatorGame,
} from "./creators";

describe("parseCreatorParam", () => {
  it("reads the type and id", () => {
    expect(parseCreatorParam("user-123")).toEqual({ type: "User", id: BigInt("123") });
    expect(parseCreatorParam("group-9007199254740993")).toEqual({
      type: "Group",
      id: BigInt("9007199254740993"),
    });
  });

  it("rejects anything else", () => {
    for (const raw of ["123", "User-1", "group-", "user-0", "team-5", "user-1a", "user--1"]) {
      expect(parseCreatorParam(raw)).toBeNull();
    }
  });

  it("round-trips with creatorPath", () => {
    expect(creatorPath(BigInt("55"), "Group")).toBe("/creators/group-55");
    expect(creatorPath(BigInt("7"), "User")).toBe("/creators/user-7");
    expect(parseCreatorParam(creatorPath(BigInt("7"), "User")!.split("/")[2])).toEqual({
      type: "User",
      id: BigInt("7"),
    });
    expect(creatorPath(null, "User")).toBeNull();
    expect(creatorPath(BigInt("7"), null)).toBeNull();
  });
});

describe("summarizeCreator", () => {
  const rpg = { id: "g1", slug: "rpg", name: "RPG" };
  const obby = { id: "g2", slug: "obby", name: "Obby" };
  const game = (over: Partial<CreatorGame>): CreatorGame => ({
    name: "x",
    creatorName: "Studio",
    lastCollectedAt: new Date("2026-09-01T00:00:00Z"),
    currentPlaying: 0,
    allTimePeakPlayers: 0,
    status: "active",
    genre: null,
    ...over,
  });

  it("totals players, counts hits at the threshold and groups genres", () => {
    const s = summarizeCreator([
      game({ currentPlaying: 500, allTimePeakPlayers: HIT_PEAK_PLAYERS, genre: rpg }),
      game({ currentPlaying: 20, allTimePeakPlayers: HIT_PEAK_PLAYERS - 1, genre: obby }),
      game({ currentPlaying: 30, allTimePeakPlayers: 50, genre: rpg, status: "dead" }),
      game({ currentPlaying: 1 }),
    ]);
    expect(s).toMatchObject({ games: 4, active: 3, totalPlaying: 551, hits: 1, unclassified: 1 });
    expect(s.genres).toEqual([
      { slug: "rpg", name: "RPG", games: 2, playing: 530 },
      { slug: "obby", name: "Obby", games: 1, playing: 20 },
    ]);
  });

  it("takes the name from the most recently collected game", () => {
    const s = summarizeCreator([
      game({ creatorName: "Old Name", lastCollectedAt: new Date("2026-08-01T00:00:00Z") }),
      game({ creatorName: "New Name", lastCollectedAt: new Date("2026-09-29T00:00:00Z") }),
      game({ creatorName: null, lastCollectedAt: new Date("2026-09-30T00:00:00Z") }),
    ]);
    expect(s.name).toBe("New Name");
  });

  it("handles no games", () => {
    expect(summarizeCreator([])).toMatchObject({ name: null, games: 0, hits: 0, genres: [] });
  });
});
