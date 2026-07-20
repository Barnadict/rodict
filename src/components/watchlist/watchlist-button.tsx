"use client";

import { Bookmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWatchlist, type WatchlistKind } from "@/lib/watchlist/store";
import { cn } from "@/lib/utils";

interface WatchlistButtonProps {
  kind: WatchlistKind;
  id: string;
  name: string;
  /** "icon" for table rows (compact, sr-only label); "default" for detail
   * page headers (visible "Watch"/"Watching" label). */
  size?: "icon" | "default";
  className?: string;
}

export function WatchlistButton({
  kind,
  id,
  name,
  size = "default",
  className,
}: WatchlistButtonProps) {
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(kind, id);
  const label = watched ? `Remove ${name} from watchlist` : `Add ${name} to watchlist`;

  return (
    <Button
      type="button"
      variant={watched ? "secondary" : "outline"}
      size={size === "icon" ? "icon-sm" : "sm"}
      aria-pressed={watched}
      aria-label={size === "icon" ? label : undefined}
      title={label}
      onClick={(e) => {
        // Rows render this inside a Link (Task #35's list-row toggle) — don't
        // let the click bubble into a navigation.
        e.preventDefault();
        e.stopPropagation();
        toggle(kind, id, name);
      }}
      className={cn("gap-1.5", watched && "glow-primary", className)}
    >
      <Bookmark aria-hidden="true" className={cn("size-3.5", watched && "fill-current")} />
      {size === "default" && <span>{watched ? "Watching" : "Watch"}</span>}
    </Button>
  );
}
