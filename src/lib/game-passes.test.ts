import { describe, it, expect } from "vitest";

import {
  PASS_REFRESH_DAYS,
  parsePasses,
  passShardForDay,
  passShardOf,
  planPassWrites,
  serializePasses,
  toPassCatalog,
  type PassCatalog,
} from "./game-passes";
import type { RobloxGamePass } from "@/lib/roblox/types";

const pass = (over: Partial<RobloxGamePass>): RobloxGamePass => ({
  id: 1,
  name: "VIP",
  isForSale: true,
  price: 100,
  ...over,
});

describe("toPassCatalog", () => {
  it("keeps on-sale passes with a positive whole price, sorted by id", () => {
    const c = toPassCatalog([
      pass({ id: 3, price: 450 }),
      pass({ id: 1, price: 1200, displayName: "Dark Blade" }),
      pass({ id: 2, isForSale: false, price: null }),
      pass({ id: 4, price: 0 }),
      pass({ id: 5, price: 9.5 }),
      pass({ id: 6, price: undefined }),
    ]);
    expect(c.passes.map((p) => p.id)).toEqual([1, 3]);
    expect(c.passes[0].name).toBe("Dark Blade");
    expect(c.forSaleCount).toBe(2);
    expect(c.totalRobux).toBe(1650);
  });

  it("dedupes ids, strips control/bidi characters and names nameless passes", () => {
    const c = toPassCatalog([
      pass({ id: 7, name: "A‮B\u0007" }),
      pass({ id: 7, name: "dup" }),
      pass({ id: 8, name: "  ", displayName: "" }),
    ]);
    expect(c.passes).toEqual([
      { id: 7, name: "dup", price: 100 },
      { id: 8, name: "Pass 8", price: 100 },
    ]);
    expect(toPassCatalog([pass({ id: 9, name: "A‮B\u0007" })]).passes[0].name).toBe("AB");
  });

  it("treats an empty list as checked with nothing on sale", () => {
    expect(toPassCatalog([])).toEqual({ passes: [], forSaleCount: 0, totalRobux: 0 });
  });
});

describe("serializePasses / parsePasses", () => {
  it("round-trips and reads malformed JSON as no passes", () => {
    const passes = [{ id: 1, name: "VIP", price: 100 }];
    expect(parsePasses(serializePasses(passes))).toEqual(passes);
    expect(parsePasses("not json")).toEqual([]);
    expect(parsePasses('{"a":1}')).toEqual([]);
    expect(parsePasses('[{"id":1}]')).toEqual([]);
  });
});

describe("weekly shards", () => {
  it("cycles through every shard over PASS_REFRESH_DAYS consecutive days", () => {
    const seen = new Set<number>();
    for (let d = 0; d < PASS_REFRESH_DAYS; d++) {
      seen.add(passShardForDay(new Date(Date.UTC(2026, 8, 30 + d, 4, 40))));
    }
    expect(seen.size).toBe(PASS_REFRESH_DAYS);
  });

  it("keeps a whole UTC day in one shard", () => {
    expect(passShardForDay(new Date("2026-09-30T00:00:00Z"))).toBe(
      passShardForDay(new Date("2026-09-30T23:59:59Z")),
    );
  });

  it("maps universe ids by mod, including ids beyond 2^53", () => {
    expect(passShardOf(BigInt(994732206))).toBe(994732206 % 7);
    expect(passShardOf(BigInt(2) ** BigInt(60) + BigInt(3))).toBe(
      Number((BigInt(2) ** BigInt(60) + BigInt(3)) % BigInt(7)),
    );
  });
});

describe("planPassWrites", () => {
  const cat = (prices: number[]): PassCatalog =>
    toPassCatalog(prices.map((price, i) => pass({ id: i + 1, price })));
  const stored = new Map([
    ["same", { passes: serializePasses(cat([100]).passes) }],
    ["changed", { passes: serializePasses(cat([100]).passes) }],
  ]);
  const fetched = [
    { gameId: "same", catalog: cat([100]) },
    { gameId: "changed", catalog: cat([150]) },
    { gameId: "new", catalog: cat([]) },
  ];

  it("inserts unchecked games, updates changed lists and skips unchanged ones", () => {
    const plan = planPassWrites(fetched, stored, 100);
    expect(plan.inserts.map((f) => f.gameId)).toEqual(["new"]);
    expect(plan.updates.map((f) => f.gameId)).toEqual(["changed"]);
    expect(plan.unchanged).toBe(1);
    expect(plan.deferred).toBe(0);
  });

  it("stops at the cap, inserts first, and counts the rest as deferred", () => {
    const plan = planPassWrites(fetched, stored, 1);
    expect(plan.inserts.map((f) => f.gameId)).toEqual(["new"]);
    expect(plan.updates).toEqual([]);
    expect(plan.deferred).toBe(1);
    expect(planPassWrites(fetched, stored, 0).deferred).toBe(2);
  });
});
