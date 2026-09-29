/** Small numeric helpers shared by trend charts and boards. */

/**
 * Trailing simple moving average. For each index i, averages the last `window`
 * points (or fewer near the start). Smooths the noise out of a player curve so
 * a real climb reads apart from sampling jitter (Task #17). With very few points
 * it degrades gracefully to near the raw series.
 */
export function movingAverage(values: number[], window: number): number[] {
  if (window <= 1) return [...values];
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

/** Format a growth ratio (0.12 -> "+12%", -0.05 -> "−5%", null -> "—"). */
export function formatGrowthPct(growth: number | null): string {
  if (growth === null) return "—";
  const pct = Math.round(growth * 1000) / 10;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct)}%`;
}

/**
 * A pause in a time series longer than this is drawn as missing data, not
 * bridged with a line (Task #52). Matches the dead rule's MAX_GAP_DAYS in
 * analytics/deadrule.py: normal gaps are at most ~1 day (quiet games are
 * collected daily), while e.g. the 2026-08-20 → 2026-09-29 outage is not data.
 */
export const SERIES_GAP_DAYS = 3;

/** Spans [from, to] (epoch ms) between consecutive points more than `gapDays` apart. */
export function findSeriesGaps(
  times: number[],
  gapDays = SERIES_GAP_DAYS,
): { from: number; to: number }[] {
  const gapMs = gapDays * 86_400_000;
  const gaps: { from: number; to: number }[] = [];
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > gapMs) gaps.push({ from: times[i - 1], to: times[i] });
  }
  return gaps;
}

/** Genre points covering less than this share of the genre's games are flagged in charts. */
export const LOW_COVERAGE = 0.8;

export interface ProjectionPoint {
  /** Epoch ms. */
  t: number;
  forecast: number;
  lower: number;
  upper: number;
}

interface ForecastInput {
  lastAt?: string;
  stepHours?: number;
  lastValue?: number;
  points: { step: number; forecast: number; lower: number; upper: number }[];
}

const RECENT_STEPS = 8;
const ANCHOR_SNAP_MS = 60_000;

/**
 * Places a forecast's steps on the time axis (Task #57). The projection starts at
 * the last point it was fitted on (`lastAt`, at `lastValue` with no band) and
 * steps forward by `stepHours`. Payloads from before #57 lack both, so they fall
 * back to the chart's last point and its recent spacing.
 *
 * Collections keep landing between analytics runs, so the chart can already have
 * real points past the anchor. Steps at or before the last real point are dropped:
 * the real data has replaced them, and a projection row in among real rows would
 * break the real line. For the same reason the anchor snaps onto a real point: the
 * one within a minute of it (normally the exact same GenreSnapshot), or, if it
 * falls inside the real data without a match, the nearest one.
 */
export function buildProjection(
  forecast: ForecastInput,
  series: { t: number; value: number }[],
): ProjectionPoint[] {
  if (forecast.points.length === 0 || series.length === 0) return [];
  const last = series[series.length - 1];

  let anchorT = forecast.lastAt ? Date.parse(forecast.lastAt) : last.t;
  if (Number.isNaN(anchorT)) anchorT = last.t;
  let near = series.find((p) => Math.abs(p.t - anchorT) <= ANCHOR_SNAP_MS);
  if (!near && anchorT < last.t) {
    near = series.reduce((a, b) => (Math.abs(b.t - anchorT) < Math.abs(a.t - anchorT) ? b : a));
  }
  if (near) anchorT = near.t;
  const anchorValue = forecast.lastValue ?? near?.value ?? last.value;

  let stepMs = (forecast.stepHours ?? 0) * 3_600_000;
  if (!(stepMs > 0)) {
    const recent = series.slice(-(RECENT_STEPS + 1)).map((p) => p.t);
    const diffs = recent
      .slice(1)
      .map((t, i) => t - recent[i])
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    if (diffs.length === 0) return [];
    const mid = Math.floor(diffs.length / 2);
    stepMs = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  }

  const out: ProjectionPoint[] = [
    { t: anchorT, forecast: anchorValue, lower: anchorValue, upper: anchorValue },
  ];
  for (const p of forecast.points) {
    const t = anchorT + p.step * stepMs;
    if (t <= last.t) continue;
    out.push({ t, forecast: p.forecast, lower: p.lower, upper: p.upper });
  }
  // Nothing left to project past the real data.
  return out.length > 1 ? out : [];
}
