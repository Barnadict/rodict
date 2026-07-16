import { connection } from "next/server";

import { getPipelineHealth } from "@/lib/db/job-runs";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Last successful collection" indicator (Task #34).
 *
 * Every number on this site is only as good as the last collection, so the
 * footer states plainly when data last landed — and says so when the pipeline
 * is failing, rather than quietly serving stale figures as if they were fresh.
 *
 * Data older than this is flagged as stale. The collector runs every 3h
 * (.github/workflows/collect.yml); 8h means several consecutive misses, not a
 * single blip or a slightly late run.
 */
const STALE_AFTER_MS = 8 * 60 * 60 * 1000;

export async function DataFreshness() {
  // This reads the clock and live DB state, so it must never be prerendered —
  // otherwise every visitor sees a freshness timestamp frozen at build time.
  await connection();

  const { lastSuccess, isFailing } = await getPipelineHealth("collect");
  const now = new Date();

  if (!lastSuccess) {
    // No successful run on record. Either nothing has run yet, or every run has
    // failed — `isFailing` separates those, since they need different fixes.
    return (
      <FreshnessLine
        tone={isFailing ? "error" : "muted"}
        text={isFailing ? "Collection failing — no data yet" : "No collection has run yet"}
      />
    );
  }

  const collectedAt = lastSuccess.finishedAt;
  const isStale = now.getTime() - collectedAt.getTime() > STALE_AFTER_MS;
  const relative = formatRelativeTime(collectedAt, now);
  const exact = collectedAt.toISOString();

  if (isFailing) {
    // Data exists but the most recent attempt failed: what's shown is real, just
    // aging. Say both parts — "stale" alone would imply the data is wrong.
    return (
      <FreshnessLine
        tone="error"
        text={`Collection failing — showing data from ${relative}`}
        title={`Last successful collection: ${exact}`}
      />
    );
  }

  return (
    <FreshnessLine
      tone={isStale ? "warn" : "ok"}
      text={`Data collected ${relative}`}
      title={`Last successful collection: ${exact}`}
    />
  );
}

const TONE_DOT = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  muted: "bg-muted-foreground/40",
} as const;

function FreshnessLine({
  tone,
  text,
  title,
}: {
  tone: keyof typeof TONE_DOT;
  text: string;
  title?: string;
}) {
  return (
    <p className="flex items-center gap-2" title={title}>
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      {text}
    </p>
  );
}
