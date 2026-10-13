import { cn } from "@/lib/utils";

const TONE = {
  line: "bg-chart-line",
  up: "bg-up",
  down: "bg-down",
} as const;

/**
 * A horizontal bar for one share or score, `value` from 0 to 1. Always sits
 * beside its figure: the bar compares rows, the number is the reading.
 */
export function ShareBar({
  value,
  tone = "line",
  className,
}: {
  value: number;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span
      aria-hidden="true"
      className={cn("block h-2 flex-1 overflow-hidden rounded-[2px] bg-muted", className)}
    >
      <span className={cn("block h-full rounded-[2px]", TONE[tone])} style={{ width: `${pct}%` }} />
    </span>
  );
}
