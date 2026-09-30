"use client";

import { useSearchParams } from "next/navigation";

import { isSharedList, parseSharedList } from "@/lib/watchlist/share";

import { CopyFeedUrl } from "./copy-feed-url";
import { ShareWatchlist } from "./share-watchlist";
import { SharedWatchlistView, WatchlistView } from "./watchlist-view";

/**
 * A `?games=…&genres=…` link shows that shared list (Task #113); without one,
 * the visitor's own. Read on the client so the page stays a static shell.
 */
export function WatchlistRoute() {
  const params = useSearchParams();
  const shared = parseSharedList((p) => params.get(p));
  if (isSharedList(shared)) return <SharedWatchlistView list={shared} />;
  return (
    <>
      {/* Own list only: on a shared link it would share the viewer's list instead. */}
      <div className="flex justify-end empty:hidden">
        <ShareWatchlist />
      </div>
      <CopyFeedUrl />
      <WatchlistView />
    </>
  );
}
