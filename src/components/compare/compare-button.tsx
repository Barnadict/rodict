"use client";

import Link from "next/link";
import { GitCompareArrows } from "lucide-react";

import { compareHref, isSelected, withAdded, type CompareKind } from "@/lib/compare";
import { useCompareSelection, writeCompareSelection } from "@/lib/compare-store";
import { cn } from "@/lib/utils";

/**
 * "Compare" next to the watchlist button (Task #65): adds this game or genre to
 * the visitor's current comparison and opens it. A plain link, so it works
 * (with just this entity) before hydration or with storage blocked.
 */
export function CompareButton({
  kind,
  id,
  name,
  className,
}: {
  kind: CompareKind;
  id: string;
  name: string;
  className?: string;
}) {
  const current = useCompareSelection();
  const next = withAdded(current, kind, id);
  const inCompare = isSelected(current, kind, id);
  const label = inCompare ? `Open comparison with ${name}` : `Add ${name} to compare`;

  return (
    <Link
      href={compareHref(next)}
      onClick={() => writeCompareSelection(next)}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors hover:bg-muted",
        inCompare && "bg-secondary",
        className,
      )}
    >
      <GitCompareArrows className="size-3.5" aria-hidden />
      <span>{inCompare ? "In compare" : "Compare"}</span>
    </Link>
  );
}
