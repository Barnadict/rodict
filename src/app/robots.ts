import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

/**
 * robots.txt (Task #72). Everything is crawlable except the JSON/CSV endpoints
 * and the per-watchlist Atom feed, which are machine interfaces, not pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/feed"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
