/**
 * Prisma returns `BigInt` for universeId/visits etc., which `JSON.stringify`
 * (and therefore React Server->Client serialization) can't handle. These helpers
 * convert DB rows into client-safe shapes with BigInt rendered as string.
 */

/** Recursively convert BigInt values to strings. Dates are left as-is. */
export function jsonSafe<T>(value: T): JsonSafe<T> {
  if (typeof value === "bigint") return value.toString() as JsonSafe<T>;
  if (value === null || typeof value !== "object") return value as JsonSafe<T>;
  if (value instanceof Date) return value as JsonSafe<T>;
  if (Array.isArray(value)) return value.map(jsonSafe) as JsonSafe<T>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
  return out as JsonSafe<T>;
}

// Maps BigInt -> string throughout a type, recursively.
export type JsonSafe<T> = T extends bigint
  ? string
  : T extends Date
    ? Date
    : T extends (infer U)[]
      ? JsonSafe<U>[]
      : T extends object
        ? { [K in keyof T]: JsonSafe<T[K]> }
        : T;
