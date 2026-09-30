import { describe, expect, it } from "vitest";

import { FEED_MAX_IDS } from "@/lib/feed";
import { entriesToAdd, isSharedList, parseSharedList, sharePath } from "@/lib/watchlist/share";

describe("sharePath", () => {
  it("puts games and genres in the query string", () => {
    expect(sharePath({ games: ["222", "111"], genres: ["simulator"] })).toBe(
      "/watchlist?games=111,222&genres=simulator",
    );
    expect(sharePath({ games: [], genres: ["obby"] })).toBe("/watchlist?genres=obby");
  });

  it("is null for an empty list", () => {
    expect(sharePath({ games: [], genres: [] })).toBeNull();
  });

  it("caps each list like the feed", () => {
    const games = Array.from({ length: FEED_MAX_IDS + 5 }, (_, i) => String(i + 1));
    const path = sharePath({ games, genres: [] })!;
    expect(new URLSearchParams(path.split("?")[1]).get("games")!.split(",")).toHaveLength(
      FEED_MAX_IDS,
    );
  });
});

describe("parseSharedList", () => {
  it("round-trips a share link and drops malformed ids", () => {
    const params = new URLSearchParams("games=111,abc,222&genres=simulator,Bad Slug");
    const list = parseSharedList((p) => params.get(p));
    expect(list).toEqual({ games: ["111", "222"], genres: ["simulator"] });
    expect(isSharedList(list)).toBe(true);
  });

  it("treats a URL without ids as no shared list", () => {
    expect(isSharedList(parseSharedList(() => null))).toBe(false);
  });
});

describe("entriesToAdd", () => {
  it("skips what the visitor already watches", () => {
    const shared = [
      { kind: "game" as const, id: "111", name: "A" },
      { kind: "genre" as const, id: "111", name: "Not a clash" },
      { kind: "genre" as const, id: "obby", name: "Obby" },
    ];
    expect(entriesToAdd(shared, [{ kind: "game", id: "111" }]).map((e) => e.name)).toEqual([
      "Not a clash",
      "Obby",
    ]);
  });
});
