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

export interface SurvivalPoint {
  week: number;
  survival: number;
}

function SurvivalTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as SurvivalPoint | undefined;
  if (!p) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="font-medium tabular-nums text-popover-foreground">
        {Math.round(p.survival * 100)}% still alive
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {p.week.toFixed(1)} weeks since launch
      </div>
    </div>
  );
}

/**
 * Kaplan-Meier survival curve (Task #56): the estimated share of a genre's
 * games still alive by the "dead" rule at each age. Drawn as steps because the
 * estimate only changes at an observed death; a sloped line would imply deaths
 * between them.
 */
export function SurvivalChart({
  data,
  medianWeeks,
  ariaLabel = "Survival curve: share of games still alive by weeks since launch",
}: {
  data: SurvivalPoint[];
  medianWeeks: number | null;
  ariaLabel?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={224} role="img" aria-label={ariaLabel}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="week"
          type="number"
          domain={[0, "dataMax"]}
          tickFormatter={(v: number) => `w${Math.round(v)}`}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          content={SurvivalTooltip}
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
        />
        {medianWeeks !== null && (
          <ReferenceLine
            x={medianWeeks}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{
              value: `median ${medianWeeks} wk`,
              position: "insideTopRight",
              fontSize: 11,
              fill: "var(--muted-foreground)",
            }}
          />
        )}
        <Line
          type="stepAfter"
          dataKey="survival"
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
