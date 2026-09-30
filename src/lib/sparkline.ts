/**
 * Daily-average sparklines (Task #102): the last SPARK_DAYS UTC days, oldest
 * first, one value per day or null when nothing was collected that day.
 */

export const SPARK_DAYS = 7;

/** The UTC days ("YYYY-MM-DD") a sparkline covers, ending on `now`'s day. */
export function sparkDays(now: Date, days = SPARK_DAYS): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, i) =>
    new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Midnight UTC at the start of the first sparkline day. */
export function sparkCutoff(now: Date, days = SPARK_DAYS): Date {
  return new Date(`${sparkDays(now, days)[0]}T00:00:00.000Z`);
}

/** Grouped `(id, day, avg)` rows → a fixed-length series per id. */
export function toSparkSeries(
  rows: { id: string; day: string; avg: number }[],
  ids: string[],
  days: string[],
): Record<string, (number | null)[]> {
  const index = new Map(days.map((d, i) => [d, i]));
  const out: Record<string, (number | null)[]> = {};
  for (const id of ids) out[id] = days.map(() => null);
  for (const r of rows) {
    const i = index.get(r.day);
    if (i !== undefined && out[r.id]) out[r.id][i] = Number(r.avg);
  }
  return out;
}
