"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ReferenceArea,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatCompact } from "@/lib/format";
import { seriesColor } from "@/lib/compare";
import {
  COLLECTION_GAP,
  COLLECTION_GAP_LABEL,
  TIME_SYNC_ID,
  overlapsCollectionGap,
  syncByTime,
} from "@/lib/chart-time";
import { ChartEmpty } from "@/components/charts/chart-empty";

export interface DailyLine {
  key: string;
  name: string;
}

/** One row per UTC day, with a number or null (no data that day, which breaks
 * the line) under each line's key. */
export interface DailyRow {
  date: string;
}

/** Names, not functions, since props cross the server→client boundary. */
export type DailyValueFormat = "percent" | "rank";

function formatValue(v: number, format: DailyValueFormat): string {
  return format === "percent" ? `${Math.round(v * 1000) / 10}%` : `#${formatCompact(v)}`;
}

function formatDay(iso: string, withYear = false): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function makeTooltip(lines: DailyLine[], format: DailyValueFormat) {
  return function DailyTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as DailyRow | undefined;
    if (!row) return null;
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
        <div className="mb-1 text-xs text-muted-foreground">{formatDay(row.date, true)} (UTC)</div>
        {lines.map((l, i) => {
          const v = (row as unknown as Record<string, unknown>)[l.key];
          return (
            <div key={l.key} className="flex items-center gap-2 tabular-nums">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: seriesColor(i) }}
              />
              <span className="text-popover-foreground">{l.name}</span>
              <span className="ml-auto pl-3 font-medium text-popover-foreground">
                {typeof v === "number" ? formatValue(v, format) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    );
  };
}

/**
 * A few lines over UTC days: concentration shares on the genre page (Task #87)
 * and rank history on the game page (Task #90). Ranks draw on a reversed axis
 * so #1 is at the top. Days without data are null and break the line rather
 * than bridging a collection pause.
 */
export function DailyLinesChart({
  data,
  lines,
  format,
  height = 224,
  ariaLabel,
  emptyMessage = "No data yet.",
}: {
  data: DailyRow[];
  lines: DailyLine[];
  format: DailyValueFormat;
  height?: number;
  ariaLabel: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <ChartEmpty title={emptyMessage} height={height} />;
  }
  const rank = format === "rank";
  // A real time axis (Task #109), so the days line up with the page's other
  // time charts for the shared crosshair and the outage band.
  const rows = data.map((d) => ({ ...d, t: Date.parse(d.date) }));
  const showOutage = rows.length > 1 && overlapsCollectionGap(rows[0].t, rows[rows.length - 1].t);
  // A single day draws no line, so show its dots.
  const showDots = data.length <= 2;
  return (
    <ResponsiveContainer width="100%" height={height} role="img" aria-label={ariaLabel}>
      <LineChart
        data={rows}
        margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
        syncId={TIME_SYNC_ID}
        syncMethod={syncByTime}
      >
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v: number) => formatDay(new Date(v).toISOString())}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          reversed={rank}
          domain={rank ? [1, "dataMax"] : [0, 1]}
          allowDecimals={false}
          tickFormatter={(v: number) => (rank ? `#${formatCompact(v)}` : `${Math.round(v * 100)}%`)}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip
          content={makeTooltip(lines, format)}
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {showOutage && (
          <ReferenceArea
            x1={COLLECTION_GAP.from}
            x2={COLLECTION_GAP.to}
            fill="var(--muted)"
            fillOpacity={0.6}
            ifOverflow="hidden"
            label={{
              value: COLLECTION_GAP_LABEL,
              position: "insideTop",
              fontSize: 11,
              fill: "var(--muted-foreground)",
            }}
          />
        )}
        {lines.map((l, i) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.name}
            stroke={seriesColor(i)}
            strokeWidth={2}
            dot={showDots ? { r: 3 } : false}
            activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
