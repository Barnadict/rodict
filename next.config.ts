import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Cache Components (Task #39). Enables `use cache` + Partial Prerendering:
   * every route now ships a prerendered static shell and streams only what's
   * genuinely per-request, instead of re-rendering whole pages against the DB.
   *
   * Why this and not `unstable_cache`/`revalidate`: Next 16 replaced those with
   * the `use cache` directive, and this flag is what turns it on.
   *
   * The fit is the point — the collector writes every 3h, so page data was being
   * re-queried on every request to produce numbers that change 8 times a day.
   * Cached loaders (`cacheLife("hours")`) live next to the pages that own them.
   */
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tr.rbxcdn.com",
      },
    ],
  },
};

export default nextConfig;
