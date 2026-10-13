import { cn } from "@/lib/utils";

const RANK_SIZE = {
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-[3.5rem]",
} as const;

/** A chart position as a large condensed numeral, right-aligned in its column. */
export function Rank({
  value,
  size = "md",
  className,
}: {
  value: number;
  size?: keyof typeof RANK_SIZE;
  className?: string;
}) {
  return (
    <span className={cn("inline-block text-right font-figure", RANK_SIZE[size], className)}>
      {value}
    </span>
  );
}

/** The small triangle beside a rise or fall. Drawn, so it matches in any font. */
export function MoveArrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 10 8"
      aria-hidden="true"
      className={cn(
        "inline-block h-[0.55em] w-[0.7em] shrink-0",
        direction === "down" && "rotate-180",
      )}
      fill="currentColor"
    >
      <path d="M5 0 10 8H0z" />
    </svg>
  );
}

/**
 * How far a row moved since the last chart: positions climbed, positions lost,
 * no change, or a new entry. `places` is positive for a climb; `null` means the
 * row wasn't on the previous chart.
 */
export function Movement({ places, className }: { places: number | null; className?: string }) {
  const base = cn("inline-flex items-center gap-1 text-sm font-extrabold", className);
  if (places === null) return <span className={cn(base, "text-up")}>New</span>;
  if (places === 0) {
    return (
      <span className={cn(base, "text-muted-foreground")}>
        <span aria-hidden="true">=</span>
        <span className="sr-only">No change</span>
      </span>
    );
  }
  const up = places > 0;
  return (
    <span className={cn(base, up ? "text-up" : "text-down")}>
      <MoveArrow direction={up ? "up" : "down"} />
      <span className="sr-only">{up ? "Up" : "Down"}</span>
      {Math.abs(places)}
    </span>
  );
}
