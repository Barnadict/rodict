"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatCompact } from "@/lib/format";
import { LOW_COVERAGE, findSeriesGaps, movingAverage, type ProjectionPoint } from "@/lib/stats";

export interface TrendPoint {
  /** ISO timestamp. */
  date: string;
  value: number;
  /** Share (0–1) of the series' members included in this point (genre series). */
  coverage?: number | null;
}

interface TrendChartProps {
  data: TrendPoint[];
  /** Noun after the value in the tooltip, e.g. "players". */
  unit?: string;
  /** Overlay a trailing moving average (needs a few points to be meaningful). */
  movingAverageWindow?: number;
  emptyMessage?: string;
  height?: number;
  /** Accessible name for screen readers — the chart's own SVG carries no
   * useful text otherwise. The "view as table" fallback next to the chart
   * covers precise values; this covers what the chart IS. */
  ariaLabel?: string;
  /** Forecast drawn after the real data as a dashed line in a shaded band
   * (Task #57); build it with `buildProjection`. */
  projection?: ProjectionPoint[];
}

type ChartRow = {
  date: string;
  t: number;
  value: number | null;
  coverage?: number | null;
  ma?: number | null;
  forecast?: number;
  band?: [number, number];
};

function makeTooltip(unit: string, hasMa: boolean) {
  return function TrendTooltip({
    active,
    payload,
    label,
  }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length || typeof label !== "number") return null;
    // Gap-break points carry a null value; there's nothing to describe there.
    const point = payload[0]?.payload as ChartRow | undefined;
    if (!point) return null;
    const isProjection = point.value === null && point.forecast !== undefined;
    if (point.value === null && !isProjection) return null;
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
        {isProjection ? (
          <>
            <div className="font-medium tabular-nums text-popover-foreground">
              Projection: ~{formatCompact(Math.round(point.forecast!))} {unit}
            </div>
            {point.band && (
              <div className="text-xs text-muted-foreground tabular-nums">
                ~80% band {formatCompact(Math.round(point.band[0]))}–
                {formatCompact(Math.round(point.band[1]))}
              </div>
            )}
          </>
        ) : (
          <div className="font-medium tabular-nums text-popover-foreground">
            {formatCompact(point.value!)} {unit}
          </div>
        )}
        {hasMa && typeof point.ma === "number" && (
          <div className="text-xs text-muted-foreground tabular-nums">
            avg {formatCompact(Math.round(point.ma))}
          </div>
        )}
        {typeof point.coverage === "number" && (
          <div className="text-xs text-muted-foreground tabular-nums">
            {Math.round(point.coverage * 100)}% of games included
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
  ariaLabel = "Line chart",
  projection = [],
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
  // `t` (epoch ms) drives a real time axis, so points sit at their actual
  // times: games are collected at different cadences (every 3h when busy, daily
  // when quiet, Task #46), and collection has gaps, which an evenly spaced
  // category axis would hide.
  const points = data.map((d, i) => ({
    ...d,
    t: Date.parse(d.date),
    ma: ma ? ma[i] : undefined,
  }));
  // Long pauses in collection are missing data, not a trend: a null point in
  // each gap breaks both lines there (connectNulls is off), and the span is
  // shaded and labeled so the break reads as "not collected" rather than zero.
  const gaps = findSeriesGaps(points.map((p) => p.t));
  const chartData: ChartRow[] = [...points];
  for (const g of gaps) {
    chartData.push({ date: "", t: (g.from + g.to) / 2, value: null, ma: null });
  }
  // The projection's anchor lands on the real point it was fitted on; its steps
  // come after the real data, so they never break the real line (see
  // buildProjection). Its own line and band bridge the rows in between.
  const rowByT = new Map(chartData.map((r) => [r.t, r]));
  for (const p of projection) {
    const extra = { forecast: p.forecast, band: [p.lower, p.upper] as [number, number] };
    const row = rowByT.get(p.t);
    if (row) Object.assign(row, extra);
    else chartData.push({ date: "", t: p.t, value: null, ma: null, ...extra });
  }
  chartData.sort((a, b) => a.t - b.t);
  const showProjection = projection.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {(showMa || showProjection) && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-primary" /> Actual
          </span>
          {showMa && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-muted-foreground" /> {movingAverageWindow}-pt
              avg
            </span>
          )}
          {showProjection && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm border-t-2 border-dashed border-primary bg-primary/15" />{" "}
              Projection (~80% band)
            </span>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height} role="img" aria-label={ariaLabel}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          {gaps.map((g) => (
            <ReferenceArea
              key={g.from}
              x1={g.from}
              x2={g.to}
              fill="var(--muted)"
              fillOpacity={0.6}
              ifOverflow="hidden"
              label={{
                value: "No data",
                position: "insideTop",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
          ))}
          {showProjection && (
            <Area
              type="linear"
              dataKey="band"
              stroke="none"
              fill="var(--primary)"
              fillOpacity={0.15}
              connectNulls
              activeDot={false}
              isAnimationActive={false}
            />
          )}
          {showProjection && (
            <Line
              type="linear"
              dataKey="forecast"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          )}
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
            dot={renderCoverageDot}
            activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** A hollow marker on points that cover too little of their genre to trust. */
function renderCoverageDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { coverage?: number | null };
}) {
  const { cx, cy, index, payload } = props;
  const key = `dot-${index}`;
  if (cx === undefined || cy === undefined || typeof payload?.coverage !== "number") {
    return <g key={key} />;
  }
  if (payload.coverage >= LOW_COVERAGE) return <g key={key} />;
  return (
    <circle
      key={key}
      cx={cx}
      cy={cy}
      r={3}
      fill="var(--background)"
      stroke="var(--primary)"
      strokeWidth={1.5}
    />
  );
}
