import { describe, it, expect } from "vitest";

import { buildCreatorRows, matchScore, normalize, searchIndex, type SearchIndex } from "./search";

describe("normalize", () => {
  it("lowercases, strips accents, emoji and punctuation", () => {
    expect(normalize("  [UPD] 🏀 Pokémon-Legends!  ")).toBe("upd pokemon legends");
  });
});

describe("matchScore", () => {
  it("ranks name prefix > word prefix > substring, and needs every word", () => {
    expect(matchScore("Blox Fruits", "blox")).toBe(3);
    expect(matchScore("Blox Fruits", "fruit")).toBe(2);
    expect(matchScore("Blox Fruits", "ruit")).toBe(1);
    expect(matchScore("Blox Fruits", "fruits blox")).toBe(2);
    expect(matchScore("Blox Fruits", "blox cars")).toBe(0);
    expect(matchScore("[UPD] 🌊 Raft Tycoon", "raft")).toBe(2);
    expect(matchScore("Anything", "")).toBe(0);
  });
});

describe("buildCreatorRows", () => {
  it("groups games by creator page and skips unknown creators", () => {
    const rows = buildCreatorRows([
      { creatorId: BigInt(1), creatorType: "Group", creatorName: "Studio", currentPlaying: 10 },
      { creatorId: BigInt(1), creatorType: "Group", creatorName: "Studio", currentPlaying: 5 },
      { creatorId: BigInt(1), creatorType: "User", creatorName: "Solo", currentPlaying: 1 },
      { creatorId: null, creatorType: null, creatorName: "Ghost", currentPlaying: 1 },
    ]);
    expect(rows).toEqual([
      ["/creators/group-1", "Studio", 2, 15],
      ["/creators/user-1", "Solo", 1, 1],
    ]);
  });
});

describe("searchIndex", () => {
  const index: SearchIndex = {
    games: [
      ["1", "Tower Defense Simulator", 5000],
      ["2", "Tower of Hell", 20000],
      ["3", "Super Tower", 90000],
    ],
    genres: [["tower-defense", "Tower Defense"]],
    themes: [["space", "Space"]],
    creators: [["/creators/group-9", "Tower Studios", 3, 100]],
  };

  it("groups by kind, best match first, busier games first among equals", () => {
    const results = searchIndex(index, "tower");
    expect(results.map((r) => `${r.kind}:${r.label}`)).toEqual([
      "genre:Tower Defense",
      "game:Tower of Hell",
      "game:Tower Defense Simulator",
      "game:Super Tower",
      "creator:Tower Studios",
    ]);
    expect(results[1].href).toBe("/games/2");
    expect(results[1].detail).toBe("20K playing");
  });

  it("returns nothing for an empty query", () => {
    expect(searchIndex(index, "  !! ")).toEqual([]);
  });
});
