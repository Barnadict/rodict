import { cacheLife } from "next/cache";

import { getGameIcons } from "@/lib/roblox/client";
import { formatCompact } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/og-card";

import { getGameShare } from "./share";

export const alt = "Roblox game statistics on rodict";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Cached so repeat crawler fetches don't re-hit Roblox's icon API. */
async function getIconUrl(universeId: bigint): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  try {
    const [icon] = await getGameIcons([universeId]);
    // Icons still in moderation come back without a usable URL.
    return icon?.state === "Completed" && icon.imageUrl ? icon.imageUrl : null;
  } catch {
    return null; // the card still works without the icon
  }
}

export default async function Image(props: { params: Promise<{ universeId: string }> }) {
  const { universeId } = await props.params;
  const share = await getGameShare(universeId);
  if (!share) return renderOgCard({ kicker: "Game", title: "Game not found" });

  const { game, genre } = share;
  const imageUrl = await getIconUrl(share.universeId);
  const byline = [genre, game.creatorName ? `by ${game.creatorName}` : null]
    .filter(Boolean)
    .join(" · ");

  return renderOgCard({
    kicker: "Game",
    title: game.name,
    subtitle: byline || null,
    imageUrl,
    stats: [
      { label: "Playing now", value: formatCompact(game.currentPlaying) },
      { label: "All-time peak", value: formatCompact(game.allTimePeakPlayers) },
      { label: "Visits", value: formatCompact(game.currentVisits) },
    ],
  });
}
