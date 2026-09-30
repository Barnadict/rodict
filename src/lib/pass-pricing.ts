/**
 * Game-pass pricing by genre (Task #89), from the weekly pass catalogs
 * (GamePassCatalog, Task #69). Pure, so it's tested without a database.
 *
 * Only games whose catalog has been checked count: a checked game with nothing
 * on sale counts as 0 passes, an unchecked game isn't counted at all.
 */

import { quantile } from "@/lib/new-releases";

/** Price buckets in Robux: [min, max] inclusive, the last open-ended. */
export const PRICE_BUCKETS = [
  { label: "<50", min: 1, max: 49 },
  { label: "50–99", min: 50, max: 99 },
  { label: "100–249", min: 100, max: 249 },
  { label: "250–499", min: 250, max: 499 },
  { label: "500–999", min: 500, max: 999 },
  { label: "1K+", min: 1000, max: Infinity },
] as const;

export interface CatalogForPricing {
  genreId: string | null;
  /** Robux prices of the game's on-sale passes (empty = none on sale). */
  prices: number[];
}

export interface PassPricing {
  /** Games with a checked catalog. */
  checkedGames: number;
  /** Checked games with at least one pass on sale. */
  gamesWithPasses: number;
  passes: number;
  /** Median on-sale passes per checked game (zeros included). */
  medianPassesPerGame: number | null;
  /** Median, p25 and p75 price over every on-sale pass. */
  medianPrice: number | null;
  p25Price: number | null;
  p75Price: number | null;
  /** Median Robux to buy every pass once, over games with passes. */
  medianTotalRobux: number | null;
  /** Share of passes (0–1) in each PRICE_BUCKETS entry. */
  distribution: number[];
}

function summarize(catalogs: CatalogForPricing[]): PassPricing {
  const counts = catalogs.map((c) => c.prices.length).sort((a, b) => a - b);
  const prices = catalogs.flatMap((c) => c.prices).sort((a, b) => a - b);
  const totals = catalogs
    .filter((c) => c.prices.length > 0)
    .map((c) => c.prices.reduce((a, b) => a + b, 0))
    .sort((a, b) => a - b);
  const distribution = PRICE_BUCKETS.map((b) =>
    prices.length ? prices.filter((p) => p >= b.min && p <= b.max).length / prices.length : 0,
  );
  return {
    checkedGames: catalogs.length,
    gamesWithPasses: totals.length,
    passes: prices.length,
    medianPassesPerGame: counts.length ? quantile(counts, 0.5) : null,
    medianPrice: prices.length ? quantile(prices, 0.5) : null,
    p25Price: prices.length ? quantile(prices, 0.25) : null,
    p75Price: prices.length ? quantile(prices, 0.75) : null,
    medianTotalRobux: totals.length ? quantile(totals, 0.5) : null,
    distribution,
  };
}

/** Pricing per genre id plus `all` across every checked game. */
export function passPricingByGenre(catalogs: CatalogForPricing[]): {
  all: PassPricing;
  genres: Map<string, PassPricing>;
} {
  const byGenre = new Map<string, CatalogForPricing[]>();
  for (const c of catalogs) {
    if (!c.genreId) continue;
    const list = byGenre.get(c.genreId) ?? [];
    list.push(c);
    byGenre.set(c.genreId, list);
  }
  return {
    all: summarize(catalogs),
    genres: new Map([...byGenre].map(([id, list]) => [id, summarize(list)])),
  };
}
