import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A tiny inline-SVG line of daily averages (Task #102). Plain SVG on purpose:
 * tables that show these don't pull in the Recharts bundle. Days without data
 * are null and break the line rather than being drawn as zero.
 */
export function Sparkline({
  values,
  width = 80,
  height = 24,
  label = "players",
  className,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  /** Noun for the accessible summary, e.g. "players". */
  label?: string;
  className?: string;
}) {
  const known = values.flatMap((v, i) => (v === null ? [] : [{ v, i }]));
  if (known.length < 2) {
    return (
      <span
        className={cn("inline-block text-xs text-muted-foreground", className)}
        style={{ width }}
        title="Not enough history for a 7-day line yet"
      >
        —
      </span>
    );
  }

  const pad = 2.5;
  const min = Math.min(...known.map((k) => k.v));
  const max = Math.max(...known.map((k) => k.v));
  const span = max - min || 1;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const x = (i: number) => pad + i * step;
  // A flat series sits mid-height instead of hugging the bottom edge.
  const y = (v: number) =>
    max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2);

  let d = "";
  let prev = -2;
  for (const { v, i } of known) {
    d += `${i === prev + 1 ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    prev = i;
  }
  const first = known[0];
  const last = known[known.length - 1];
  const summary = `${values.length}-day average ${label}: ${formatCompact(Math.round(first.v))} → ${formatCompact(Math.round(last.v))}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={summary}
      className={cn("inline-block shrink-0 overflow-visible align-middle", className)}
    >
      <title>{summary}</title>
      <path
        d={d}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(last.i)} cy={y(last.v)} r={2} fill="var(--primary)" />
    </svg>
  );
}
