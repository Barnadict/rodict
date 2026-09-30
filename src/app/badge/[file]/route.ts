import type { NextRequest } from "next/server";
import { cacheLife } from "next/cache";

import { getBadgeGame } from "@/lib/db/badge";
import {
  badgeContent,
  parseBadgeFile,
  parseBadgeMetric,
  renderBadge,
  type BadgeMetric,
} from "@/lib/badge";

/** The badge's data, cached per game and metric like the pages. */
async function getBadgeData(universeId: string, metric: BadgeMetric) {
  "use cache";
  cacheLife("hours");
  return getBadgeGame(BigInt(universeId), metric === "rank");
}

/**
 * Live badge (Task #93): `/badge/<universe id>.svg`, players now by default or
 * `?metric=rank` for the rank by players now. An unknown game gets a grey
 * "not tracked" badge with a 404, so an embed never shows a broken image.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/badge/[file]">) {
  const { file } = await ctx.params;
  const universeId = parseBadgeFile(file);
  const metric = parseBadgeMetric(request.nextUrl.searchParams.get("metric"));
  const game = universeId ? await getBadgeData(universeId, metric) : null;
  const href = universeId ? `${request.nextUrl.origin}/games/${universeId}` : undefined;
  return new Response(renderBadge(badgeContent(game, metric, href)), {
    status: game ? 200 : 404,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Collections land every few hours; image proxies (e.g. GitHub's camo)
      // honour this, so an embed refreshes within the hour.
      "Cache-Control": "public, max-age=1800, s-maxage=1800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
