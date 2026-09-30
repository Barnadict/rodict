import type { NextRequest } from "next/server";

import { getWeeklyRecap } from "@/lib/cached-queries";
import { renderAtom } from "@/lib/feed";
import { recapSections, weeklyFeedEntry } from "@/lib/weekly";

/** Atom feed of the weekly recap (Task #92): one entry per ISO week. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const { data, now } = await getWeeklyRecap();
  const entry = weeklyFeedEntry(recapSections(data), now, origin);
  const body = renderAtom({
    origin,
    selfPath: "/weekly/feed",
    entries: [entry],
    updated: now,
    title: "rodict weekly recap",
    subtitle:
      "Top risers, new entrants, games that went dead and the biggest spikes on Roblox in the last 7 days.",
    alternatePath: "/weekly",
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
