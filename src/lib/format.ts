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
