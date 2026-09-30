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
import type { DayPoint, LifecycleBandPoint } from "@/lib/new-releases";

type Row = {
  day: number;
  game?: number;
  median?: number;
  band?: [number, number];
  nGames?: number;
};

function makeTooltip(gameName: string, genreName: string) {
  return function EarlyCurveTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
    const row = payload?.[0]?.payload as Row | undefined;
    if (!active || !row) return null;
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
        <div className="mb-1 text-xs text-muted-foreground">Day {row.day} since launch</div>
        <div className="flex items-center gap-2 tabular-nums">
          <span className="h-0.5 w-3 rounded" style={{ background: "var(--series-1)" }} />
          <span className="max-w-48 truncate">{gameName}</span>
          <span className="ml-auto pl-3 font-medium">
            {row.game !== undefined ? formatCompact(Math.round(row.game)) : "—"}
          </span>
        </div>
        {row.median !== undefined && (
          <>
            <div className="flex items-center gap-2 tabular-nums">
              <span className="h-0.5 w-3 rounded bg-muted-foreground" />
              <span>{genreName} median</span>
              <span className="ml-auto pl-3 font-medium">
                {formatCompact(Math.round(row.median))}
              </span>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              middle half {formatCompact(Math.round(row.band![0]))}–
              {formatCompact(Math.round(row.band![1]))} · {row.nGames} games
            </div>
          </>
        )}
      </div>
    );
  };
}

/**
 * A new game's daily average players by day since launch, over its genre's
 * median and middle half at the same ages (Task #66).
 */
export function EarlyCurveChart({
  game,
  genre,
  gameName,
  genreName,
  maxDays,
}: {
  game: DayPoint[];
  genre: LifecycleBandPoint[];
  gameName: string;
  genreName: string;
  maxDays: number;
}) {
  const rows = new Map<number, Row>();
  const row = (day: number) => rows.get(day) ?? rows.set(day, { day }).get(day)!;
  for (const p of game) row(p.day).game = p.value;
  for (const g of genre) {
    Object.assign(row(g.day), { median: g.median, band: [g.p25, g.p75], nGames: g.nGames });
  }
  const data = [...rows.values()].sort((a, b) => a.day - b.day);

  if (game.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-center text-muted-foreground">
        No readings from this game&apos;s first {maxDays} days.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: "var(--series-1)" }} />
          <span className="text-foreground">{gameName}</span>
        </span>
        {genre.length > 0 && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-muted-foreground" /> {genreName} median
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm bg-muted-foreground/25" /> middle half of{" "}
              {genreName} games
            </span>
          </>
        )}
      </div>
      <ResponsiveContainer
        width="100%"
        height={288}
        role="img"
        aria-label={`Line chart of ${gameName}'s daily average players by day since launch, over the ${genreName} median`}
      >
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, maxDays]}
            tickFormatter={(v: number) => `d${v}`}
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
            content={makeTooltip(gameName, genreName)}
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
          />
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
          <Line
            type="monotone"
            dataKey="game"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "var(--series-1)", strokeWidth: 0 }}
            activeDot={{ r: 4, stroke: "var(--background)", strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
