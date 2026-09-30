import { describe, expect, it } from "vitest";

import { PRICE_BUCKETS, passPricingByGenre } from "@/lib/pass-pricing";

describe("passPricingByGenre", () => {
  const { all, genres } = passPricingByGenre([
    { genreId: "sim", prices: [25, 100, 400] },
    { genreId: "sim", prices: [] },
    { genreId: "sim", prices: [1500] },
    { genreId: "obby", prices: [50] },
    { genreId: null, prices: [75, 75] },
  ]);

  it("counts checked games with none on sale as zero passes", () => {
    const sim = genres.get("sim")!;
    expect(sim.checkedGames).toBe(3);
    expect(sim.gamesWithPasses).toBe(2);
    expect(sim.passes).toBe(4);
    expect(sim.medianPassesPerGame).toBe(1);
  });

  it("pools every pass for the price quantiles", () => {
    const sim = genres.get("sim")!;
    expect(sim.medianPrice).toBe(250);
    expect(sim.p25Price).toBe(81.25);
    expect(sim.medianTotalRobux).toBe((525 + 1500) / 2);
  });

  it("bins prices into shares that sum to 1", () => {
    const sim = genres.get("sim")!;
    expect(sim.distribution).toHaveLength(PRICE_BUCKETS.length);
    expect(sim.distribution).toEqual([0.25, 0, 0.25, 0.25, 0, 0.25]);
  });

  it("includes unclassified games only in the all-genres figure", () => {
    expect(all.checkedGames).toBe(5);
    expect([...genres.keys()].sort()).toEqual(["obby", "sim"]);
  });

  it("handles a genre with no passes at all", () => {
    const { genres: g } = passPricingByGenre([{ genreId: "x", prices: [] }]);
    expect(g.get("x")).toMatchObject({ medianPrice: null, medianTotalRobux: null, passes: 0 });
    expect(g.get("x")!.distribution.every((v) => v === 0)).toBe(true);
  });
});
