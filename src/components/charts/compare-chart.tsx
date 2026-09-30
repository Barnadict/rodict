"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatCompact } from "@/lib/format";
import {
  latestAtOrBefore,
  mergeSeries,
  seriesColor,
  type CompareScale,
  type SeriesPoint,
} from "@/lib/compare";

export interface CompareSeries {
  key: string;
  name: string;
  points: SeriesPoint[];
}

function formatValue(v: number, scale: CompareScale): string {
  return scale === "indexed" ? `${Math.round(v)}` : formatCompact(Math.round(v));
}

function makeTooltip(series: CompareSeries[], scale: CompareScale, gapMs: number) {
  return function CompareTooltip({ active, label }: TooltipContentProps<ValueType, NameType>) {
    if (!active || typeof label !== "number") return null;
    // Each series' own latest reading at the hovered time, not the drawn
    // (interpolated) value, so the numbers are real collections.
    const lines = series.map((s, i) => ({
      s,
      i,
      p: latestAtOrBefore(s.points, label, gapMs),
    }));
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
        <div className="mb-1 text-xs text-muted-foreground">
          {new Date(label).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </div>
        {lines.map(({ s, i, p }) => (
          <div key={s.key} className="flex items-center gap-2 tabular-nums">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: seriesColor(i) }}
            />
            <span className="max-w-48 truncate text-popover-foreground">{s.name}</span>
            <span className="ml-auto pl-3 font-medium text-popover-foreground">
              {p ? formatValue(p.value, scale) : "—"}
            </span>
          </div>
        ))}
        {lines.some(({ p }) => p && p.t !== label) && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            Latest reading at or before this time.
          </div>
        )}
      </div>
    );
  };
}

/**
 * Two to four series on one time axis (Task #65). One y-axis only: in
 * "indexed" mode every series is rebased to 100 at its first reading, which is
 * how series of very different sizes share it.
 */
export function CompareChart({
  series,
  scale,
  gapMs,
  ariaLabel,
  height = 320,
}: {
  series: CompareSeries[];
  scale: CompareScale;
  gapMs: number;
  ariaLabel: string;
  height?: number;
}) {
  const withData = series.filter((s) => s.points.length > 0);
  if (withData.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-muted-foreground"
        style={{ height }}
      >
        No readings in this range yet.
      </div>
    );
  }
  const rows = mergeSeries(series, gapMs);
  // A reading with no drawn neighbour on either side is a line of zero length,
  // i.e. invisible, so those get a dot.
  const isolated = new Map(
    series.map((s) => [
      s.key,
      new Set(
        rows.flatMap((r, i) =>
          r[s.key] !== null && rows[i - 1]?.[s.key] == null && rows[i + 1]?.[s.key] == null
            ? [i]
            : [],
        ),
      ),
    ]),
  );

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map((s, i) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: seriesColor(i) }} />
            <span className="text-foreground">{s.name}</span>
            {s.points.length === 0 && <span>(no readings in range)</span>}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={height} role="img" aria-label={ariaLabel}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) =>
              new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            }
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => formatValue(v, scale)}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={makeTooltip(series, scale, gapMs)}
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          />
          {scale === "indexed" && (
            <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
          )}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={seriesColor(i)}
              strokeWidth={2}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index !== undefined &&
                isolated.get(s.key)!.has(props.index) &&
                props.cx !== undefined &&
                props.cy !== undefined ? (
                  <circle
                    key={`${s.key}-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill={seriesColor(i)}
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                ) : (
                  <g key={`${s.key}-${props.index}`} />
                )
              }
              activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
