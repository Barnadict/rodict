/**
 * Core HTTP layer for the Roblox client: polite rate limiting, retries with
 * backoff (honouring `Retry-After` on 429s), request timeouts, an in-process
 * TTL response cache, and in-flight request coalescing.
 *
 * Scope note: the cache + limiter are per-process (fine for the collector and a
 * single Next.js server instance). A shared/persistent cache can be layered on
 * later if needed; this keeps us within Roblox's rate limits and avoids
 * hammering identical requests in the meantime.
 */

const DEFAULT_USER_AGENT = "rodict/0.1 (personal Roblox stats project; respects rate limits)";

// Conservative global limits — Roblox rate-limits per IP, more aggressively for
// datacenter IPs (a known risk for the GitHub Actions collector, Task #32).
const MAX_CONCURRENT = 4;
const MIN_INTERVAL_MS = 60;

export interface RobloxGetOptions {
  /** Cache TTL in ms. 0 disables caching for this call. Default 60_000. */
  ttlMs?: number;
  /** Per-attempt timeout in ms. Default 15_000. */
  timeoutMs?: number;
  /** Max attempts including the first. Default 4. */
  maxAttempts?: number;
  /** Caller abort signal (merged with the per-attempt timeout). */
  signal?: AbortSignal;
}

export class RobloxApiError extends Error {
  constructor(
    readonly status: number, // 0 = network/timeout
    message: string,
    readonly body?: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RobloxApiError";
  }
}

// --- rate limiter: caps concurrency and spaces request starts ---------------

function createLimiter(maxConcurrent: number, minIntervalMs: number) {
  let active = 0;
  let nextStart = 0;
  const queue: (() => void)[] = [];

  const pump = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    const now = Date.now();
    const wait = Math.max(0, nextStart - now);
    nextStart = Math.max(now, nextStart) + minIntervalMs;
    const run = queue.shift()!;
    active++;
    setTimeout(run, wait);
  };

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          fn()
            .then(resolve, reject)
            .finally(() => {
              active--;
              pump();
            });
        });
        pump();
      });
    },
  };
}

const limiter = createLimiter(MAX_CONCURRENT, MIN_INTERVAL_MS);

// --- caching + coalescing ---------------------------------------------------

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/** Clear the in-process cache (used by tests and manual refreshes). */
export function clearRobloxCache(): void {
  cache.clear();
}

// --- helpers ----------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt: number): number {
  const base = 300 * 2 ** (attempt - 1); // 300, 600, 1200, ...
  return Math.min(8000, base) + Math.floor(Math.random() * 250);
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

async function safeText(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return undefined;
  }
}

async function doFetch(
  url: string,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    return await fetch(url, {
      headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

async function fetchWithRetry<T>(url: string, opts: RobloxGetOptions): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxAttempts = opts.maxAttempts ?? 4;

  let attempt = 0;
  while (true) {
    attempt++;
    let res: Response;
    try {
      res = await limiter.schedule(() => doFetch(url, timeoutMs, opts.signal));
    } catch (err) {
      // network error or timeout/abort — retry unless the caller aborted
      if (opts.signal?.aborted) throw err;
      if (attempt >= maxAttempts) {
        throw new RobloxApiError(
          0,
          `Network error for ${url} after ${attempt} attempts`,
          undefined,
          err,
        );
      }
      await sleep(backoffMs(attempt));
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    // retry on rate-limit / server errors
    if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
      const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"));
      await sleep(retryAfter ?? backoffMs(attempt));
      continue;
    }

    throw new RobloxApiError(
      res.status,
      `Roblox API ${res.status} for ${url}`,
      await safeText(res),
    );
  }
}

/**
 * GET a JSON resource with caching, coalescing, rate limiting, and retries.
 */
export async function robloxGet<T>(url: string, opts: RobloxGetOptions = {}): Promise<T> {
  const ttlMs = opts.ttlMs ?? 60_000;

  if (ttlMs > 0) {
    const hit = cache.get(url);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  }

  // coalesce concurrent identical requests
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fetchWithRetry<T>(url, opts);
      if (ttlMs > 0) cache.set(url, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise as Promise<T>;
}
