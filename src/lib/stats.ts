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
