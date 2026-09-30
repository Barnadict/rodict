import type { TursoUsage } from "./write-counts";

/**
 * Turso's own monthly rows-written counter, from the Platform API (Task #81).
 *
 * Needs `TURSO_API_TOKEN` (a Platform API token, not the database token) and
 * `TURSO_ORG` (the org slug). Returns null when either is missing or the API
 * fails, so the guard falls back to the measured count. Read-only.
 */

const API = "https://api.turso.tech/v1/organizations";
const TIMEOUT_MS = 10_000;

export async function fetchTursoUsage(
  env: Record<string, string | undefined> = process.env,
): Promise<TursoUsage | null> {
  const token = env.TURSO_API_TOKEN;
  const org = env.TURSO_ORG;
  if (!token || !org) return null;
  const get = async (path: string) => {
    const res = await fetch(`${API}/${encodeURIComponent(org)}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Turso API ${res.status} for ${path}`);
    return (await res.json()) as Record<string, unknown>;
  };
  try {
    const [usage, subscription] = await Promise.all([get("usage"), get("subscription")]);
    return parseTursoUsage(usage, subscription);
  } catch (err) {
    console.warn(`Turso usage unavailable, using the measured count: ${String(err)}`);
    return null;
  }
}

/** Pure: pick the fields we need out of the two API responses, or null. */
export function parseTursoUsage(usage: unknown, subscription: unknown): TursoUsage | null {
  const rows = (usage as { organization?: { usage?: { rows_written?: unknown } } })?.organization
    ?.usage?.rows_written;
  const start = (subscription as { subscription?: { current_billing_period_start?: unknown } })
    ?.subscription?.current_billing_period_start;
  if (typeof rows !== "number" || typeof start !== "string") return null;
  const periodStart = new Date(start);
  if (Number.isNaN(periodStart.getTime())) return null;
  return { rowsWritten: rows, periodStart };
}
