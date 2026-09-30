import { formatCompact } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/og-card";

import { getGenreShare } from "./share";

export const alt = "Roblox genre statistics on rodict";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const share = await getGenreShare(slug);
  if (!share) return renderOgCard({ kicker: "Genre", title: "Genre not found" });

  const { genre, stat } = share;
  return renderOgCard({
    kicker: "Genre",
    title: genre.name,
    subtitle: genre.description ?? "Player trends, survival and estimated earnings",
    stats: stat
      ? [
          { label: "Games tracked", value: formatCompact(stat.gameCount) },
          { label: "Playing now", value: formatCompact(stat.totalPlaying) },
          { label: "Total visits", value: formatCompact(stat.totalVisits) },
        ]
      : [],
  });
}
