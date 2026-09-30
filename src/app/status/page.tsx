import { Suspense } from "react";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { connection } from "next/server";

import { COLLECTION_CADENCE } from "@/lib/collector/cadence";
import {
  BUDGET_GUARD,
  decideBudgetGuard,
  WRITE_PACE,
  type BudgetGuardMode,
} from "@/lib/collector/budget-guard";
import { getCollectionCoverage, getRunsSince, type TierCoverage } from "@/lib/db/status";
import { getDatabaseSizeBytes, getMonthWriteBudget } from "@/lib/db/write-budget";
import { TURSO_FREE_PLAN } from "@/lib/db/write-counts";
import { formatCompact, formatExact, formatRelativeTime } from "@/lib/format";
import {
  STATUS_JOBS,
  STATUS_WINDOW_DAYS,
  formatDuration,
  formatShare,
  share,
  summarizeJobHealth,
  type JobHealth,
  type StatusRun,
} from "@/lib/status";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTile } from "@/components/data-table/stat-tile";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";
import { LocalTime } from "@/components/local-time";

export const metadata = {
  title: "Status — rodict",
  description:
    "Pipeline health for rodict: recent collection and analytics runs, how much of the tracked corpus is fresh, and month-to-date database writes against the free-plan cap.",
};

const DAY_MS = 86_400_000;
const RECENT_RUNS_SHOWN = 30;

const JOB_LABELS: Record<string, string> = {
  collect: "Collection",
  analytics: "Analytics",
  gamepasses: "Game passes",
  "discovery-probe": "Discovery probe",
};

const JOB_SCHEDULES: Record<string, string> = {
  collect: `every ${COLLECTION_CADENCE.runIntervalHours}h`,
  analytics: "twice a day",
  gamepasses: "once a day",
};

/**
 * Everything the page shows, in one cached read. Minutes, not hours: this page
 * exists to answer "is it running right now?". The clock is read inside so the
 * cache key stays constant. Read-only: ~100 JobRun rows, one Game aggregate,
 * and two PRAGMAs.
 */
async function getStatusData() {
  "use cache";
  cacheLife("minutes");

  const now = new Date();
  const [runs, coverage, budget, dbBytes] = await Promise.all([
    getRunsSince(new Date(now.getTime() - STATUS_WINDOW_DAYS * DAY_MS)),
    getCollectionCoverage(now),
    getMonthWriteBudget(now),
    getDatabaseSizeBytes().catch(() => null),
  ]);
  const cap = TURSO_FREE_PLAN.rowsWrittenPerMonth;
  return {
    runs,
    health: summarizeJobHealth(runs, STATUS_JOBS),
    coverage,
    budget,
    // As a scheduled (paced, Task #79) collect run would decide right now.
    guard: decideBudgetGuard(budget, cap, { pace: true }),
    cap,
    dbBytes,
    computedAt: now,
  };
}

export default function StatusPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
        <p className="max-w-2xl text-muted-foreground">
          How the data pipelines are doing: recent runs, how much of the tracked corpus is fresh,
          and how much of the database&apos;s monthly write allowance has been used. See{" "}
          <Link href="/about" className="underline underline-offset-4">
            About the data
          </Link>{" "}
          for how collection works.
        </p>
      </header>
      <Suspense fallback={<StatusSkeleton />}>
        <StatusContent />
      </Suspense>
    </div>
  );
}

async function StatusContent() {
  // Relative times ("12 minutes ago") are computed against the request clock,
  // so this part renders per request; the DB reads behind it are cached.
  await connection();
  const data = await getStatusData();
  const now = new Date();

  return (
    <>
      <BudgetSection data={data} />
      <PipelinesSection health={data.health} now={now} />
      <CoverageSection coverage={data.coverage} />
      <RecentRunsSection runs={data.runs.slice(0, RECENT_RUNS_SHOWN)} now={now} />
      <p className="text-xs text-muted-foreground">
        Figures as of <LocalTime value={data.computedAt} /> (refreshed every few minutes).
      </p>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// --- Write budget -------------------------------------------------------------

const GUARD_LABEL: Record<BudgetGuardMode, { text: string; tone: Tone }> = {
  normal: { text: "Normal", tone: "ok" },
  reduced: { text: "Reduced (busy games only)", tone: "warn" },
  paced: { text: "Paced (ahead of the line)", tone: "warn" },
  paused: { text: "Paused", tone: "error" },
};

function BudgetSection({ data }: { data: Awaited<ReturnType<typeof getStatusData>> }) {
  const { budget, guard, cap, dbBytes } = data;
  const used = share(budget.measuredWritesToDate, cap) ?? 0;
  const projected = budget.projectedMonthWrites;
  const monthName = budget.monthStart.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <Section
      title="Write budget"
      description={
        <>
          The database is on Turso&apos;s free plan, which allows{" "}
          {formatExact(TURSO_FREE_PLAN.rowsWrittenPerMonth)} rows written per month. Hitting that
          cap in August 2026 stopped collection for six weeks, so collection now slows down at{" "}
          {Math.round(BUDGET_GUARD.reduceAt * 100)}% of the cap and pauses at{" "}
          {Math.round(BUDGET_GUARD.pauseAt * 100)}%. Scheduled runs also keep to an even line
          through the month, aimed at {Math.round(WRITE_PACE.margin * 100)}% of the cap: a run that
          finds the month ahead of the line is skipped. The month resets on the 1st (UTC).
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Rows written in ${monthName}`}
          value={formatCompact(budget.measuredWritesToDate)}
          hint={`${formatShare(used)} of ${formatCompact(cap)}`}
        />
        <StatTile
          label="Projected month end"
          value={projected === null ? "—" : formatCompact(projected)}
          badge="Est."
          hint={
            projected === null
              ? "Needs a measured run of every job"
              : `${formatShare(share(projected, cap))} of the cap, on the current schedule`
          }
        />
        <StatTile
          label="Collection guard"
          value={
            <ToneText tone={GUARD_LABEL[guard.mode].tone}>{GUARD_LABEL[guard.mode].text}</ToneText>
          }
          hint={`Pace line: ${formatCompact(guard.paceAllowance)} by now`}
        />
        <StatTile
          label="Storage used"
          value={dbBytes === null ? "—" : formatBytes(dbBytes)}
          hint={
            dbBytes === null
              ? undefined
              : `${formatShare(share(dbBytes, TURSO_FREE_PLAN.storageBytes))} of ${formatBytes(TURSO_FREE_PLAN.storageBytes)}`
          }
        />
      </div>

      <BudgetBar
        used={used}
        projected={projected === null ? null : projected / cap}
        pace={guard.paceAllowance / cap}
      />

      {guard.reason && <p className="text-sm text-amber-600 dark:text-amber-400">{guard.reason}</p>}
      {budget.unmeasuredRuns > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatExact(budget.unmeasuredRuns)} run{budget.unmeasuredRuns === 1 ? "" : "s"} this
          month recorded no write count, so the true total may be a little higher.
        </p>
      )}
    </Section>
  );
}

/** A 0–100% bar of the cap: solid = written so far, faint = projected, blue
 * tick = where the even-pace line (Task #79) is today. */
function BudgetBar({
  used,
  projected,
  pace,
}: {
  used: number;
  projected: number | null;
  pace: number;
}) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;
  const tone =
    used >= BUDGET_GUARD.pauseAt
      ? "bg-red-500"
      : used >= BUDGET_GUARD.reduceAt
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="space-y-1.5">
      <div
        className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${formatShare(used)} of the monthly write cap used, pace line at ${formatShare(pace)}${projected === null ? "" : `, ${formatShare(projected)} projected by month end (estimate)`}`}
      >
        {projected !== null && (
          <div
            className={cn("absolute inset-y-0 left-0 opacity-30", tone)}
            style={{ width: pct(projected) }}
          />
        )}
        <div className={cn("absolute inset-y-0 left-0", tone)} style={{ width: pct(used) }} />
        {[BUDGET_GUARD.reduceAt, BUDGET_GUARD.pauseAt].map((mark) => (
          <div
            key={mark}
            className="absolute inset-y-0 w-px bg-foreground/60"
            style={{ left: pct(mark) }}
          />
        ))}
        <div className="absolute inset-y-0 w-0.5 bg-sky-500" style={{ left: pct(pace) }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0</span>
        <span>
          Solid: written so far · Faint: projected (Est.) · Blue: pace line today · Lines: slow-down
          and pause points
        </span>
        <span>{formatCompact(TURSO_FREE_PLAN.rowsWrittenPerMonth)}</span>
      </div>
    </div>
  );
}

// --- Pipelines ----------------------------------------------------------------

function PipelinesSection({ health, now }: { health: JobHealth[]; now: Date }) {
  return (
    <Section
      title="Pipelines"
      description={`Outcomes over the last ${STATUS_WINDOW_DAYS} days. A partial run finished but skipped some games or was slowed by the write-budget guard.`}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {health.map((h) => (
          <div key={h.job} className="space-y-2 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{JOB_LABELS[h.job] ?? h.job}</h3>
              <Badge variant="outline" className="text-[10px]">
                {JOB_SCHEDULES[h.job] ?? "scheduled"}
              </Badge>
            </div>
            {h.lastRun ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Last run</dt>
                <dd>
                  <StatusPill status={h.lastRun.status} />{" "}
                  <span title={h.lastRun.startedAt.toISOString()}>
                    {formatRelativeTime(h.lastRun.startedAt, now)}
                  </span>
                </dd>
                <dt className="text-muted-foreground">Last success</dt>
                <dd>
                  {h.lastSuccess
                    ? formatRelativeTime(h.lastSuccess.finishedAt, now)
                    : "none in window"}
                </dd>
                <dt className="text-muted-foreground">Runs</dt>
                <dd className="tabular-nums">
                  {h.runs} · <ToneText tone="ok">{h.success} ok</ToneText>
                  {h.partial > 0 && (
                    <>
                      {" "}
                      · <ToneText tone="warn">{h.partial} partial</ToneText>
                    </>
                  )}
                  {h.failure > 0 && (
                    <>
                      {" "}
                      · <ToneText tone="error">{h.failure} failed</ToneText>
                    </>
                  )}
                </dd>
                <dt className="text-muted-foreground">Typical run</dt>
                <dd className="tabular-nums">
                  {h.medianDurationMs === null ? "—" : formatDuration(h.medianDurationMs)} (median)
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No runs in the last {STATUS_WINDOW_DAYS} days.
              </p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Coverage -----------------------------------------------------------------

const TIER_INFO: Record<TierCoverage["tier"], { label: string; cadence: string }> = {
  busy: {
    label: `Busy (≥${COLLECTION_CADENCE.busyMinPlaying} playing, or new in the last ${COLLECTION_CADENCE.newGameDays} days)`,
    cadence: `every ${COLLECTION_CADENCE.runIntervalHours}h, so expect ~100% within 6h`,
  },
  low: {
    label: "Low activity",
    cadence: `about every ${COLLECTION_CADENCE.lowIntervalHours}h, so expect ~100% within 24h`,
  },
};

function CoverageSection({ coverage }: { coverage: TierCoverage[] }) {
  const total = coverage.reduce(
    (acc, t) => ({
      total: acc.total + t.total,
      within6h: acc.within6h + t.within6h,
      within24h: acc.within24h + t.within24h,
    }),
    { total: 0, within6h: 0, within24h: 0 },
  );
  return (
    <Section
      title="Collection coverage"
      description="The share of tracked games collected recently. Quiet games are collected once a day rather than every run, to stay within the write budget, so their 6-hour share is expected to be low."
    >
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Games</TableHead>
              <TableHead className="text-right">Collected in last 6h</TableHead>
              <TableHead className="text-right">Collected in last 24h</TableHead>
              <TableHead>Cadence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coverage.map((t) => (
              <TableRow key={t.tier}>
                <TableCell className="font-medium whitespace-normal">
                  {TIER_INFO[t.tier].label}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatExact(t.total)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatShare(share(t.within6h, t.total))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatShare(share(t.within24h, t.total))}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-normal">
                  {TIER_INFO[t.tier].cadence}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-medium">All tracked games</TableCell>
              <TableCell className="text-right tabular-nums">{formatExact(total.total)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatShare(share(total.within6h, total.total))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatShare(share(total.within24h, total.total))}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}

// --- Recent runs --------------------------------------------------------------

function RecentRunsSection({ runs, now }: { runs: StatusRun[]; now: Date }) {
  return (
    <Section
      title="Recent runs"
      description="Newest first. Rows written counts every database row a run inserted, updated or deleted, including its own entry in this log. Runs from before write counting began show —."
    >
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No runs in the last {STATUS_WINDOW_DAYS} days.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Rows written</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <LocalTime value={r.startedAt} />
                    <div className="text-xs text-muted-foreground">
                      {formatRelativeTime(r.startedAt, now)}
                    </div>
                  </TableCell>
                  <TableCell>{JOB_LABELS[r.job] ?? r.job}</TableCell>
                  <TableCell>
                    <StatusPill status={r.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(r.durationMs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.writesTotal === null ? "—" : formatExact(r.writesTotal + 1)}
                  </TableCell>
                  <TableCell className="max-w-md text-xs whitespace-normal text-muted-foreground">
                    {r.error ? <span title={r.error}>{firstLine(r.error, 160)}</span> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

// --- Bits ---------------------------------------------------------------------

type Tone = "ok" | "warn" | "error";

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
};

function ToneText({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={TONE_TEXT[tone]}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = { success: "ok", partial: "warn", failure: "error" };

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        tone ? TONE_TEXT[tone] : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok"
            ? "bg-emerald-500"
            : tone === "warn"
              ? "bg-amber-500"
              : tone === "error"
                ? "bg-red-500"
                : "bg-muted-foreground/40",
        )}
      />
      {status}
    </span>
  );
}

function firstLine(text: string, max: number): string {
  const line = text.split("\n")[0];
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function StatusSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <span className="sr-only">Loading status…</span>
      <StatTilesSkeleton count={4} />
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
      <TableSkeleton rows={3} cols={5} />
      <TableSkeleton rows={10} cols={6} />
    </div>
  );
}
