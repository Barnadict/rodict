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
  ReferenceDot,
  ReferenceLine,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatCompact } from "@/lib/format";
import {
  COLLECTION_GAP,
  COLLECTION_GAP_LABEL,
  TIME_SYNC_ID,
  overlapsCollectionGap,
  syncByTime,
} from "@/lib/chart-time";
import { ChartEmpty } from "@/components/charts/chart-empty";
import {
  LOW_COVERAGE,
  findSeriesGaps,
  formatGrowthPct,
  movingAverage,
  type ProjectionPoint,
} from "@/lib/stats";

export interface TrendPoint {
  /** ISO timestamp. */
  date: string;
  value: number;
  /** Share (0–1) of the series' members included in this point (genre series). */
  coverage?: number | null;
}

/** A flagged spike or drop drawn on the line (Task #62). */
export interface TrendMarker {
  /** ISO timestamp of the point the change landed on. */
  date: string;
  value: number;
  direction: "spike" | "drop";
  /** Relative change, e.g. 0.8 = +80%. */
  changePct: number;
}

/** How values render on the axis and in the tooltip. Functions can't cross the
 * server→client boundary, so this is a name rather than a formatter. */
export type TrendValueFormat = "compact" | "percent";

function formatValue(v: number, format: TrendValueFormat): string {
  return format === "percent" ? `${Math.round(v * 1000) / 10}%` : formatCompact(Math.round(v));
}

interface TrendChartProps {
  data: TrendPoint[];
  /** Shown under the empty state: when this chart fills in (Task #109). */
  emptyHint?: React.ReactNode;
  /** Charts sharing an id share one crosshair; time charts all default to one. */
  syncId?: string;
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
  valueFormat?: TrendValueFormat;
  markers?: TrendMarker[];
  /** ISO timestamps drawn as dashed vertical lines, e.g. game updates (Task #63). */
  events?: string[];
  /** Legend label for `events`. */
  eventLabel?: string;
  /** Line color, e.g. a genre's own (Task #106). Defaults to the primary. */
  color?: string;
}

type ChartRow = {
  date: string;
  t: number;
  value: number | null;
  coverage?: number | null;
  ma?: number | null;
  forecast?: number;
  band?: [number, number];
  marker?: TrendMarker;
};

/** A marker attaches to the real row within this of its timestamp. */
const MARKER_SNAP_MS = 60_000;

function makeTooltip(unit: string, hasMa: boolean, format: TrendValueFormat) {
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
              Projection: ~{formatValue(point.forecast!, format)} {unit}
            </div>
            {point.band && (
              <div className="text-xs text-muted-foreground tabular-nums">
                ~80% band {formatValue(point.band[0], format)}–{formatValue(point.band[1], format)}
              </div>
            )}
          </>
        ) : (
          <div className="font-medium tabular-nums text-popover-foreground">
            {formatValue(point.value!, format)} {unit}
          </div>
        )}
        {point.marker && (
          <div
            className={
              point.marker.direction === "spike"
                ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                : "text-xs font-medium text-destructive"
            }
          >
            {point.marker.direction === "spike" ? "▲ Flagged spike" : "▼ Flagged drop"}{" "}
            {formatGrowthPct(point.marker.changePct)}
          </div>
        )}
        {hasMa && typeof point.ma === "number" && (
          <div className="text-xs text-muted-foreground tabular-nums">
            avg {formatValue(point.ma, format)}
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
  emptyHint,
  syncId = TIME_SYNC_ID,
  height = 288,
  ariaLabel = "Line chart",
  projection = [],
  valueFormat = "compact",
  markers = [],
  events = [],
  eventLabel = "Event",
  color = "var(--primary)",
}: TrendChartProps) {
  if (data.length === 0) {
    return <ChartEmpty title={emptyMessage} hint={emptyHint} height={height} />;
  }
  if (data.length === 1) {
    // One reading draws no line; say so rather than show a lone dot.
    return (
      <ChartEmpty
        title="Not enough history to draw a line yet"
        hint={
          <>
            {`Only one reading in this range so far (${formatValue(data[0].value, valueFormat)}${unit ? ` ${unit}` : ""}). A line appears after the next collection.`}
            {emptyHint && <> {emptyHint}</>}
          </>
        }
        height={height}
      />
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
  // Shaded spans: the known 2026 outage is labeled as such and widened to its
  // full dates; other long pauses are plain "No data".
  const shaded = gaps.map((g) =>
    overlapsCollectionGap(g.from, g.to)
      ? {
          from: Math.min(g.from, COLLECTION_GAP.from),
          to: Math.max(g.to, COLLECTION_GAP.to),
          label: COLLECTION_GAP_LABEL,
        }
      : { ...g, label: "No data" },
  );
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

  // Only markers inside the plotted range; each also tags its row so the
  // tooltip names the change when hovering that point.
  const first = points[0].t;
  const last = points[points.length - 1].t;
  const shownMarkers = markers
    .map((m) => ({ ...m, t: Date.parse(m.date) }))
    .filter((m) => m.t >= first - MARKER_SNAP_MS && m.t <= last + MARKER_SNAP_MS);
  for (const m of shownMarkers) {
    const row = points.find((p) => Math.abs(p.t - m.t) <= MARKER_SNAP_MS);
    if (row) (row as ChartRow).marker = m;
  }
  const showMarkers = shownMarkers.length > 0;
  const shownEvents = events.map((e) => Date.parse(e)).filter((t) => t >= first && t <= last);
  const showEvents = shownEvents.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {(showMa || showProjection || showMarkers || showEvents) && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: color }} /> Actual
          </span>
          {showMa && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-muted-foreground" /> {movingAverageWindow}-pt
              avg
            </span>
          )}
          {showProjection && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-4 rounded-sm border-t-2 border-dashed"
                style={{
                  borderColor: color,
                  background: `color-mix(in oklch, ${color} 15%, transparent)`,
                }}
              />{" "}
              Projection (~80% band)
            </span>
          )}
          {showMarkers && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-emerald-500" /> Flagged spike
              <span className="ml-2 size-2.5 rounded-full bg-destructive" /> Flagged drop
            </span>
          )}
          {showEvents && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-0 border-l-2 border-dashed border-muted-foreground" />{" "}
              {eventLabel}
            </span>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height} role="img" aria-label={ariaLabel}>
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          syncId={syncId}
          syncMethod={syncByTime}
        >
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
            tickFormatter={(v: number) => formatValue(v, valueFormat)}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            content={makeTooltip(unit, showMa, valueFormat)}
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          />
          {shaded.map((g) => (
            <ReferenceArea
              key={g.from}
              x1={g.from}
              x2={g.to}
              fill="var(--muted)"
              fillOpacity={0.6}
              ifOverflow="hidden"
              label={{
                value: g.label,
                position: "insideTop",
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
          ))}
          {shownEvents.map((t) => (
            <ReferenceLine
              key={t}
              x={t}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 3"
              ifOverflow="hidden"
            />
          ))}
          {showProjection && (
            <Area
              type="linear"
              dataKey="band"
              stroke="none"
              fill={color}
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
              stroke={color}
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
            stroke={color}
            strokeWidth={2}
            dot={(props: Parameters<typeof renderCoverageDot>[0]) =>
              renderCoverageDot({ ...props, color })
            }
            activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {shownMarkers.map((m) => (
            <ReferenceDot
              key={m.t}
              x={m.t}
              y={m.value}
              r={5}
              fill={m.direction === "spike" ? "var(--color-emerald-500)" : "var(--destructive)"}
              stroke="var(--background)"
              strokeWidth={2}
              ifOverflow="discard"
            />
          ))}
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
  color?: string;
}) {
  const { cx, cy, index, payload, color = "var(--primary)" } = props;
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
      stroke={color}
      strokeWidth={1.5}
    />
  );
}
