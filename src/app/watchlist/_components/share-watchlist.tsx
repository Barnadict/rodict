"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";

import { useWatchlist } from "@/lib/watchlist/store";
import { FEED_MAX_IDS } from "@/lib/feed";
import { sharePath } from "@/lib/watchlist/share";

import { Button } from "@/components/ui/button";

/**
 * Copies a link that holds the watchlist (Task #113). Whoever opens it sees
 * the same games and genres and can save them to their own device.
 */
export function ShareWatchlist() {
  const { entries } = useWatchlist();
  const [copied, setCopied] = React.useState(false);

  const games = entries.filter((e) => e.kind === "game").map((e) => e.id);
  const genres = entries.filter((e) => e.kind === "genre").map((e) => e.id);
  const path = sharePath({ games, genres });
  if (!path) return null;
  const truncated = games.length > FEED_MAX_IDS || genres.length > FEED_MAX_IDS;

  async function share() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. an insecure origin): show it to copy by hand.
      window.prompt("Copy the watchlist link:", url);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={share}
      title={
        truncated
          ? `The link holds the first ${FEED_MAX_IDS} games and ${FEED_MAX_IDS} genres.`
          : "Copy a link to this watchlist"
      }
    >
      {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}
