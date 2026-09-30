import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { MetricHelp } from "@/components/metric-help";
import type { GlossaryKey } from "@/lib/glossary";

interface SortableHeaderProps<F extends string> {
  field: F;
  label: string;
  currentSort: F;
  currentOrder: "asc" | "desc";
  /** The rest of the current query string, so sorting preserves filters. */
  baseParams: Record<string, string | undefined>;
  /** Glossary entry for a derived stat: a "?" after the label (Task #112). */
  help?: GlossaryKey;
}

export function SortableHeader<F extends string>({
  field,
  label,
  currentSort,
  currentOrder,
  baseParams,
  help,
}: SortableHeaderProps<F>) {
  const isActive = field === currentSort;
  const nextOrder = isActive && currentOrder === "desc" ? "asc" : "desc";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(baseParams)) {
    if (value) params.set(key, value);
  }
  params.set("sort", field);
  params.set("order", nextOrder);

  const Icon = !isActive ? ArrowUpDown : currentOrder === "desc" ? ArrowDown : ArrowUp;

  const link = (
    <Link
      href={`?${params.toString()}`}
      className="inline-flex items-center gap-1 hover:text-foreground"
      scroll={false}
    >
      {label}
      <Icon
        aria-hidden="true"
        className={`size-3.5 ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}
      />
      {isActive && (
        <span className="sr-only">
          , sorted {currentOrder === "desc" ? "descending" : "ascending"}
        </span>
      )}
    </Link>
  );
  // The "?" sits outside the link: a button can't go inside one.
  return help ? (
    <span className="inline-flex items-center gap-1">
      {link}
      <MetricHelp term={help} />
    </span>
  ) : (
    link
  );
}
