import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

interface SortableHeaderProps<F extends string> {
  field: F;
  label: string;
  currentSort: F;
  currentOrder: "asc" | "desc";
  /** The rest of the current query string, so sorting preserves filters. */
  baseParams: Record<string, string | undefined>;
}

export function SortableHeader<F extends string>({
  field,
  label,
  currentSort,
  currentOrder,
  baseParams,
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

  return (
    <Link
      href={`?${params.toString()}`}
      className="inline-flex items-center gap-1 hover:text-foreground"
      scroll={false}
    >
      {label}
      <Icon className={`size-3.5 ${isActive ? "text-foreground" : "text-muted-foreground/50"}`} />
    </Link>
  );
}
