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
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatCompact } from "@/lib/format";
import type { BenchmarkBandPoint } from "@/lib/launch-benchmark";

export interface LifecyclePoint {
  weekAge: number;
  avgPlaying: number;
  sampleCount: number;
}

/** One x position: a weekly lifecycle point, a daily benchmark point, or both. */
type Row = {
  weekAge: number;
  avgPlaying?: number;
  sampleCount?: number;
  day?: number;
  median?: number;
  band?: [number, number];
  n?: number;
};

function LifecycleTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as Row | undefined;
  if (!p) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      {p.avgPlaying !== undefined && (
        <>
          <div className="font-medium tabular-nums text-popover-foreground">
            {formatCompact(Math.round(p.avgPlaying))} avg players
          </div>
          <div className="text-xs text-muted-foreground">
            week {p.weekAge} since launch · {p.sampleCount} sample
            {p.sampleCount === 1 ? "" : "s"}
          </div>
        </>
      )}
      {p.median !== undefined && (
        <>
          <div className="font-medium tabular-nums text-popover-foreground">
            Day {p.day}: median launch {formatCompact(Math.round(p.median))}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            middle half {formatCompact(Math.round(p.band![0]))}–
            {formatCompact(Math.round(p.band![1]))} · {p.n} games
          </div>
        </>
      )}
    </div>
  );
}

export function LifecycleChart({
  data,
  band = [],
  ariaLabel = "Lifecycle chart: average players by weeks since launch",
}: {
  data: LifecyclePoint[];
  /** Launch benchmark (Task #83), by day since launch; drawn at day ÷ 7 weeks. */
  band?: BenchmarkBandPoint[];
  ariaLabel?: string;
}) {
  if (data.length < 2 && band.length < 2) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-muted-foreground">
        <p>Not enough longitudinal history to plot a lifecycle curve yet.</p>
        <p className="text-sm">
          This fills in as weeks of snapshots accumulate — expected during cold start.
        </p>
      </div>
    );
  }

  const rows = new Map<number, Row>();
  const row = (x: number) => rows.get(x) ?? rows.set(x, { weekAge: x }).get(x)!;
  for (const p of data) Object.assign(row(p.weekAge), p);
  for (const b of band) {
    Object.assign(row(b.day / 7), {
      day: b.day,
      median: b.median,
      band: [b.p25, b.p75],
      n: b.n,
    });
  }
  const merged = [...rows.values()].sort((a, b) => a.weekAge - b.weekAge);

  return (
    <div className="flex flex-col gap-2">
      {band.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-primary" /> average players
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-muted-foreground" /> median launch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-muted-foreground/25" /> middle half of launches
            (p25–p75)
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={224} role="img" aria-label={ariaLabel}>
        <ComposedChart data={merged} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="weekAge"
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v: number) => `w${Math.round(v)}`}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
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
            content={LifecycleTooltip}
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          />
          {band.length > 0 && (
            <>
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="var(--muted-foreground)"
                fillOpacity={0.2}
                connectNulls
                activeDot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="median"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="avgPlaying"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            connectNulls
            activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
