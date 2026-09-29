"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface SeasonalityCell {
  /** UTC weekday, 0 = Monday. */
  weekday: number;
  /** UTC hour, 0–23. */
  hour: number;
  /** Mean players in this cell ÷ the series' overall mean. */
  index: number;
  /** Readings averaged into the cell. */
  n: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_MINUTES = 7 * 1440;
const HOUR_TICKS = [0, 6, 12, 18];

const noopSubscribe = () => () => {};

/** Minutes to ADD to UTC to get local time; null on the server (render UTC). */
function useLocalOffsetMinutes(): number | null {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => -new Date().getTimezoneOffset(),
    () => null,
  );
}

function formatOffset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "−";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

interface LocalCell {
  weekday: number;
  hour: number;
  index: number;
  n: number;
}

/**
 * Shifts UTC cells into the viewer's timezone. A cell moves whole: its weekday
 * and hour shift together, which is why the analytics job stores joint cells
 * rather than separate weekday and hour averages. Half-hour offsets land in the
 * local hour the reading's hour starts in. Two UTC cells can't meet in one local
 * cell (the shift is the same for all), so no merging is needed.
 */
function toLocal(cells: SeasonalityCell[], offsetMinutes: number): LocalCell[] {
  return cells.map((c) => {
    const utc = c.weekday * 1440 + c.hour * 60;
    const local = (((utc + offsetMinutes) % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
    return {
      weekday: Math.floor(local / 1440),
      hour: Math.floor((local % 1440) / 60),
      index: c.index,
      n: c.n,
    };
  });
}

/**
 * Weekday × hour seasonality (Task #58), in the viewer's local time. Each cell is
 * how busy the genre was at that hour relative to its own average: 1.3× means
 * 30% above. Descriptive only. Hours with no collection stay blank, since the
 * collector runs every 3h and never fills all 24.
 */
export function SeasonalityHeatmap({ cells }: { cells: SeasonalityCell[] }) {
  const offset = useLocalOffsetMinutes();
  const [hover, setHover] = React.useState<LocalCell | null>(null);

  const local = React.useMemo(() => toLocal(cells, offset ?? 0), [cells, offset]);
  const grid = React.useMemo(() => {
    const m = new Map<string, LocalCell>();
    for (const c of local) m.set(`${c.weekday}:${c.hour}`, c);
    return m;
  }, [local]);

  // Per-day average, weighted by readings, rebuilt in local days.
  const dayIndex = React.useMemo(() => {
    const sum = Array(7).fill(0);
    const n = Array(7).fill(0);
    for (const c of local) {
      sum[c.weekday] += c.index * c.n;
      n[c.weekday] += c.n;
    }
    return sum.map((s, i) => (n[i] > 0 ? s / n[i] : null));
  }, [local]);

  // Colour domain: 10th–90th percentile, so one odd cell (a few readings from a
  // single unusual day) doesn't wash every other cell into the same shade.
  // Cells outside it saturate; exact values stay in the hover text.
  const [lo, hi] = React.useMemo(() => {
    const v = local.map((c) => c.index).sort((a, b) => a - b);
    if (v.length === 0) return [0, 0];
    const at = (q: number) => v[Math.round(q * (v.length - 1))];
    return [at(0.1), at(0.9)];
  }, [local]);

  // One hue, light → dark. Keep a floor so the palest cell is still visible
  // against the page, and read "blank" only as "not collected".
  const shade = (index: number) => {
    const f = hi > lo ? Math.min(1, Math.max(0, (index - lo) / (hi - lo))) : 0.5;
    const pct = Math.round(12 + f * 78);
    return `color-mix(in oklch, var(--primary) ${pct}%, var(--background))`;
  };

  const tz = offset === null ? "UTC" : `your time, ${formatOffset(offset)}`;
  const peakDay = dayIndex.reduce<number | null>(
    (best, v, i) => (v !== null && (best === null || v > dayIndex[best]!) ? i : best),
    null,
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Heatmap of players by weekday and hour relative to the genre's average, in ${tz}.${
          peakDay !== null
            ? ` Busiest day on average: ${WEEKDAYS[peakDay]} at ${dayIndex[peakDay]!.toFixed(2)}×.`
            : ""
        }`}
        className="grid items-center gap-0.5 text-[10px] text-muted-foreground"
        style={{ gridTemplateColumns: "2rem repeat(24, minmax(0, 1fr)) 2.75rem" }}
        onMouseLeave={() => setHover(null)}
      >
        {WEEKDAYS.map((label, wd) => (
          <React.Fragment key={label}>
            <span className="pr-1">{label}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const c = grid.get(`${wd}:${h}`);
              return (
                <span
                  key={h}
                  className={cn(
                    "aspect-square rounded-xs",
                    !c && "border border-dashed border-border/60",
                    c && hover === c && "ring-2 ring-foreground",
                  )}
                  style={c ? { background: shade(c.index) } : undefined}
                  onMouseEnter={() => setHover(c ?? null)}
                  title={
                    c
                      ? `${label} ${hourLabel(h)}: ${c.index.toFixed(2)}× average (${c.n} reading${c.n === 1 ? "" : "s"})`
                      : `${label} ${hourLabel(h)}: not collected`
                  }
                />
              );
            })}
            <span className="text-right tabular-nums text-foreground">
              {dayIndex[wd] !== null ? `${dayIndex[wd]!.toFixed(2)}×` : "—"}
            </span>
          </React.Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="tabular-nums">
            {HOUR_TICKS.includes(h) ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
        <span className="text-right">day avg</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {hover
            ? `${WEEKDAYS[hover.weekday]} ${hourLabel(hover.hour)}: players are ${hover.index.toFixed(2)}× the average (${hover.n} reading${hover.n === 1 ? "" : "s"})`
            : `Hours in ${tz}. Hover a cell for its value.`}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          ≤{lo.toFixed(2)}×
          <span
            className="h-2 w-16 rounded-sm"
            style={{
              background: `linear-gradient(to right, ${shade(lo)}, ${shade(hi)})`,
            }}
          />
          ≥{hi.toFixed(2)}×
        </span>
      </div>
    </div>
  );
}
