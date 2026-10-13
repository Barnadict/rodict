import { MoveArrow } from "@/components/rank";
import { formatGrowthPct } from "@/lib/stats";

/** Signed growth percentage with its arrow: green up, soft red down, muted for none/unknown. */
export function GrowthBadge({ growth }: { growth: number | null }) {
  if (growth === null) return <span className="text-muted-foreground">—</span>;
  if (growth === 0) return <span className="text-muted-foreground">{formatGrowthPct(growth)}</span>;
  const up = growth > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold ${up ? "text-up" : "text-down"}`}
    >
      <MoveArrow direction={up ? "up" : "down"} />
      {formatGrowthPct(growth)}
    </span>
  );
}
