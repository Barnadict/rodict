import { prisma } from "@/lib/prisma";
import { parsePasses } from "@/lib/game-passes";
import { passPricingByGenre, type PassPricing } from "@/lib/pass-pricing";

export interface PassPricingIndex {
  all: PassPricing;
  /** By genre id. */
  genres: Record<string, PassPricing>;
}

/**
 * Pass pricing for every genre (Task #89). One read of GamePassCatalog (one row
 * per checked game, ~1K now, at most one per tracked game) joined to each
 * game's genre. Callers cache it, so the genre pages and /genres share it.
 */
export async function getPassPricingIndex(): Promise<PassPricingIndex> {
  const rows = await prisma.gamePassCatalog.findMany({
    select: { passes: true, game: { select: { currentGenreId: true } } },
  });
  const { all, genres } = passPricingByGenre(
    rows.map((r) => ({
      genreId: r.game.currentGenreId,
      prices: parsePasses(r.passes).map((p) => p.price),
    })),
  );
  return { all, genres: Object.fromEntries(genres) };
}
