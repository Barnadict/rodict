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
