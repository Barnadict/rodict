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

export interface LifecyclePoint {
  weekAge: number;
  avgPlaying: number;
  sampleCount: number;
}

function LifecycleTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as LifecyclePoint | undefined;
  if (!p) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="font-medium tabular-nums text-popover-foreground">
        {formatCompact(Math.round(p.avgPlaying))} avg players
      </div>
      <div className="text-xs text-muted-foreground">
        week {p.weekAge} since launch · {p.sampleCount} sample{p.sampleCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export function LifecycleChart({
  data,
  ariaLabel = "Lifecycle chart: average players by weeks since launch",
}: {
  data: LifecyclePoint[];
  ariaLabel?: string;
}) {
  if (data.length < 2) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-muted-foreground">
        <p>Not enough longitudinal history to plot a lifecycle curve yet.</p>
        <p className="text-sm">
          This fills in as weeks of snapshots accumulate — expected during cold start.
        </p>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={224} role="img" aria-label={ariaLabel}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="weekAge"
          type="number"
          tickFormatter={(v: number) => `w${v}`}
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
        <Line
          type="monotone"
          dataKey="avgPlaying"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
