"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatCompact } from "@/lib/format";
import { movingAverage } from "@/lib/stats";

export interface TrendPoint {
  /** ISO timestamp. */
  date: string;
  value: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  /** Noun after the value in the tooltip, e.g. "players". */
  unit?: string;
  /** Overlay a trailing moving average (needs a few points to be meaningful). */
  movingAverageWindow?: number;
  emptyMessage?: string;
  height?: number;
}

function makeTooltip(unit: string, hasMa: boolean) {
  return function TrendTooltip({
    active,
    payload,
    label,
  }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length || typeof label !== "string") return null;
    const point = payload[0]?.payload as (TrendPoint & { ma?: number }) | undefined;
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
        <div className="font-medium tabular-nums text-popover-foreground">
          {point ? formatCompact(point.value) : "—"} {unit}
        </div>
        {hasMa && point?.ma !== undefined && (
          <div className="text-xs text-muted-foreground tabular-nums">
            avg {formatCompact(Math.round(point.ma))}
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {new Date(label).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      </div>
    );
  };
}

export function TrendChart({
  data,
  unit = "",
  movingAverageWindow,
  emptyMessage = "No data in this range yet.",
  height = 288,
}: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-muted-foreground"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  const showMa = !!movingAverageWindow && movingAverageWindow > 1 && data.length >= 3;
  const ma = showMa
    ? movingAverage(
        data.map((d) => d.value),
        movingAverageWindow!,
      )
    : null;
  const chartData = data.map((d, i) => ({ ...d, ma: ma ? ma[i] : undefined }));

  return (
    <div className="flex flex-col gap-2">
      {showMa && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-primary" /> Actual
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-muted-foreground" /> {movingAverageWindow}-pt avg
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) =>
              new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            }
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v)}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={makeTooltip(unit, showMa)}
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          />
          {showMa && (
            <Line
              type="monotone"
              dataKey="ma"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
