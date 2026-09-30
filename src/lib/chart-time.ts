/**
 * Shared time-chart behavior (Task #109): the known collection outage every
 * time chart shades, and one crosshair shared by the time charts on a page.
 */

/** Nothing was collected in this span (the write cap was hit), epoch ms. */
export const COLLECTION_GAP = {
  from: Date.UTC(2026, 7, 20),
  to: Date.UTC(2026, 8, 29),
} as const;

export const COLLECTION_GAP_LABEL = "No data collected";

/** Time charts on the same page share this Recharts syncId. */
export const TIME_SYNC_ID = "time";

/** A synced label within this of a chart's nearest point snaps to it. */
const SYNC_TOLERANCE_MS = 1.5 * 86_400_000;

/** Epoch ms from an axis value: epoch ms (number or numeric string) or an ISO date. */
export function toEpochMs(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v);
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Date.parse(s);
}

/**
 * Recharts `syncMethod`: the tick nearest in time to the hovered label, so
 * charts whose points fall at different times (every-3h readings vs. one per
 * day) still share one crosshair. -1 hides this chart's tooltip.
 */
export function syncByTime(
  ticks: ReadonlyArray<{ value: unknown }>,
  data: { activeLabel?: string | number | null },
): number {
  const target = toEpochMs(data.activeLabel);
  if (!Number.isFinite(target)) return -1;
  let best = -1;
  let bestDist = Infinity;
  ticks.forEach((tick, i) => {
    const dist = Math.abs(toEpochMs(tick.value) - target);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return bestDist <= SYNC_TOLERANCE_MS ? best : -1;
}

/** Whether [from, to] overlaps the collection outage. */
export function overlapsCollectionGap(from: number, to: number): boolean {
  return from <= COLLECTION_GAP.to && to >= COLLECTION_GAP.from;
}
