"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  COMPARE_MAX,
  compareHref,
  isSelected,
  withAdded,
  type CompareSelection,
} from "@/lib/compare";
import { useWatchlist } from "@/lib/watchlist/store";

/**
 * Quick-add chips from the visitor's watchlist. Adding anything else goes
 * through the "Compare" button on its game or genre page.
 */
export function CompareSuggestions({
  selection,
  extra,
}: {
  selection: CompareSelection;
  extra: Record<string, string | undefined>;
}) {
  const { entries } = useWatchlist();
  const options = entries.filter((e) => !isSelected(selection, e.kind, e.id));
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">From your watchlist:</span>
      {options.map((e) => {
        const list = e.kind === "game" ? selection.games : selection.genres;
        const full = list.length >= COMPARE_MAX;
        return (
          <Link
            key={`${e.kind}:${e.id}`}
            href={compareHref(withAdded(selection, e.kind, e.id), extra)}
            title={full ? `Replaces the oldest ${e.kind} (max ${COMPARE_MAX})` : undefined}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 hover:bg-muted"
          >
            <Plus className="size-3" aria-hidden />
            {e.name}
            <span className="text-xs text-muted-foreground">{e.kind}</span>
          </Link>
        );
      })}
    </div>
  );
}
