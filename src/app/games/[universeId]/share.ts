import { cacheLife } from "next/cache";

import { getGameShareInfo, parseUniverseIdParam } from "@/lib/db/seo";
import { formatCompact } from "@/lib/format";

/**
 * A game's title/description/share-image data (Task #72), shared by
 * `generateMetadata` and `opengraph-image.tsx`. A separate, narrow loader so a
 * crawler fetching the share image doesn't pay for the full page read.
 */
export async function getGameShare(universeIdParam: string) {
  "use cache";
  cacheLife("hours");

  const universeId = parseUniverseIdParam(universeIdParam);
  if (universeId === null) return null;
  const game = await getGameShareInfo(universeId);
  if (!game) return null;

  const genre = game.currentGenre?.name ?? null;
  const by = game.creatorName ? ` by ${game.creatorName}` : "";
  const kind = genre ? `${genre} game` : "Game";
  const description =
    `${kind} on Roblox${by}: ${formatCompact(game.currentPlaying)} playing now, ` +
    `all-time peak ${formatCompact(game.allTimePeakPlayers)}, ` +
    `${formatCompact(game.currentVisits)} visits. Player trends and estimated earnings on rodict.`;

  return { universeId, game, genre, description };
}
