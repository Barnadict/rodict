import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from "@/lib/og-card";

/** The site-wide share image (Task #72); game and genre pages override it. */

export const alt = "rodict — Roblox game trends & statistics";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    title: "Roblox game trends & statistics",
    subtitle:
      "Player counts, genre trends and estimated earnings for developers deciding what to build next.",
  });
}
