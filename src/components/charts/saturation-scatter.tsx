"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { formatCompact } from "@/lib/format";

export interface SaturationPoint {
  slug: string;
  name: string;
  games: number;
  totalPlaying: number;
  playersPerGame: number;
}

function SaturationTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as SaturationPoint | undefined;
  if (!p) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="font-medium text-popover-foreground">{p.name}</div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {formatCompact(p.games)} games · {formatCompact(p.totalPlaying)} players
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {formatCompact(Math.round(p.playersPerGame))} players per game
      </div>
    </div>
  );
}

export function SaturationScatter({
  data,
  ariaLabel = "Scatter chart: games vs. players per game by genre",
}: {
  data: SaturationPoint[];
  ariaLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        No genre data yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={360} role="img" aria-label={ariaLabel}>
      <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
        <CartesianGrid stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="games"
          name="Games"
          tickFormatter={(v: number) => formatCompact(v)}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          label={{
            value: "Number of games (supply) →",
            position: "insideBottom",
            offset: -12,
            fill: "var(--muted-foreground)",
            fontSize: 12,
          }}
        />
        <YAxis
          type="number"
          dataKey="playersPerGame"
          name="Players per game"
          tickFormatter={(v: number) => formatCompact(v)}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={52}
          label={{
            value: "Players per game (demand) →",
            angle: -90,
            position: "insideLeft",
            fill: "var(--muted-foreground)",
            fontSize: 12,
            style: { textAnchor: "middle" },
          }}
        />
        <Tooltip content={SaturationTooltip} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={data} fill="var(--primary)">
          <LabelList
            dataKey="name"
            position="top"
            style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
