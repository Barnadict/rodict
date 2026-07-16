import { formatGrowthPct } from "@/lib/stats";

/** Signed, colored growth percentage — green up, red down, muted for none/unknown. */
export function GrowthBadge({ growth }: { growth: number | null }) {
  if (growth === null) return <span className="text-muted-foreground">—</span>;
  const positive = growth > 0;
  const negative = growth < 0;
  return (
    <span
      className={
        positive
          ? "text-emerald-600 dark:text-emerald-400"
          : negative
            ? "text-red-600 dark:text-red-400"
            : "text-muted-foreground"
      }
    >
      {formatGrowthPct(growth)}
    </span>
  );
}
