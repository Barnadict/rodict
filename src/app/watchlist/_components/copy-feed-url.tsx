"use client";

import * as React from "react";
import { Check, Copy, Rss } from "lucide-react";

import { useWatchlist } from "@/lib/watchlist/store";
import { FEED_MAX_IDS, feedQuery, parseFeedIds } from "@/lib/feed";

import { Button } from "@/components/ui/button";

/**
 * The watchlist's Atom feed URL (Task #68). The feed reads its ids from the
 * URL, so nothing is stored server-side: a reader polls it and alerts on new
 * entries. A later watchlist change needs a new URL.
 */
export function CopyFeedUrl() {
  const { entries } = useWatchlist();
  const [copied, setCopied] = React.useState(false);

  const games = entries.filter((e) => e.kind === "game").map((e) => e.id);
  const genres = entries.filter((e) => e.kind === "genre").map((e) => e.id);
  const query = feedQuery({
    games: parseFeedIds(games.join(","), "game"),
    genres: parseFeedIds(genres.join(","), "genre"),
  });
  if (!query) return null;
  const truncated = games.length > FEED_MAX_IDS || genres.length > FEED_MAX_IDS;

  async function copy() {
    const url = `${window.location.origin}/feed${query}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. an insecure origin): show it to copy by hand.
      window.prompt("Copy the feed URL:", url);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-muted-foreground">
        <Rss className="mt-0.5 size-4 shrink-0 text-orange-500" aria-hidden="true" />
        <span>
          Get alerts in a feed reader: an Atom feed of flagged spikes and drops and big weekly moves
          for this watchlist. The URL holds the list, so copy it again after adding or removing
          something.
          {truncated && ` Only the first ${FEED_MAX_IDS} games and genres are included.`}
        </span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0">
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copied" : "Copy feed URL"}
      </Button>
    </div>
  );
}
