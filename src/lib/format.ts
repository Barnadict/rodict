/** Shared number/currency formatting for tables, stat tiles, and charts. */

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const plainNumber = new Intl.NumberFormat("en-US");

/** 218900 -> "218.9K", 62756731203 -> "62.8B". Accepts bigint/string too. */
export function formatCompact(value: number | bigint | string): string {
  return compactNumber.format(typeof value === "bigint" ? value : Number(value));
}

/** Thousands-comma'd, for table cells that need exact counts. */
export function formatExact(value: number | bigint | string): string {
  return plainNumber.format(typeof value === "bigint" ? value : Number(value));
}

/** 19065 -> "$19.1K". */
export function formatUsdCompact(value: number): string {
  return compactUsd.format(value);
}

/** A labeled range for the "Est." earnings badge, e.g. "$7.6K–$42.9K". */
export function formatUsdRange(low: number, high: number): string {
  return `${formatUsdCompact(low)}–${formatUsdCompact(high)}`;
}

const relativeTime = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

/**
 * "3 hours ago" / "in 2 days". Pass `now` explicitly from a caller that has
 * already opted out of prerendering — reading the clock here would otherwise
 * bake a build-time value into a static render.
 */
export function formatRelativeTime(date: Date, now: Date): string {
  const deltaMs = date.getTime() - now.getTime();
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= unitMs) {
      return relativeTime.format(Math.round(deltaMs / unitMs), unit);
    }
  }
  return "just now";
}
