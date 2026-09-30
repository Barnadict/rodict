import { prisma } from "@/lib/prisma";
import { effectiveRunStatus } from "@/lib/collector/run-health";

/**
 * Run history for the collector / analytics pipelines (Task #34).
 *
 * Every run records a row here — including failed ones — so the UI can tell
 * "data is stale because nothing ran" apart from "data is stale because the
 * last run failed", and so failures leave a trace beyond the CI logs.
 */

export type JobName = "collect" | "analytics" | "gamepasses";
export type JobStatus = "success" | "partial" | "failure";

export interface JobRunRecord {
  job: JobName;
  status: JobStatus;
  startedAt: Date;
  finishedAt: Date;
  summary?: unknown;
  error?: string | null;
}

/** Longest an error message may be before it's truncated (keeps rows small). */
const MAX_ERROR_LENGTH = 2000;

export async function recordJobRun(record: JobRunRecord): Promise<void> {
  await prisma.jobRun.create({
    data: {
      job: record.job,
      status: record.status,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationMs: record.finishedAt.getTime() - record.startedAt.getTime(),
      summary: record.summary === undefined ? null : JSON.stringify(record.summary),
      error: record.error ? record.error.slice(0, MAX_ERROR_LENGTH) : null,
    },
  });
}

export interface JobRunView {
  id: string;
  job: string;
  status: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  error: string | null;
}

const RUN_VIEW_SELECT = {
  id: true,
  job: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  durationMs: true,
  summary: true,
  error: true,
} as const;

/** A row with its status replaced by `effectiveRunStatus` (Task #75), so a
 * `partial` collect run that saved (almost) nothing reads as a failure. */
function toView({ summary, ...row }: JobRunView & { summary: string | null }): JobRunView {
  return { ...row, status: effectiveRunStatus({ ...row, summary }) };
}

/** The most recent run of a job, whatever its outcome. */
export async function getLastRun(job: JobName): Promise<JobRunView | null> {
  const row = await prisma.jobRun.findFirst({
    where: { job },
    orderBy: { startedAt: "desc" },
    select: RUN_VIEW_SELECT,
  });
  return row ? toView(row) : null;
}

/** How many recent success/partial rows to scan past broken ones. */
const LAST_SUCCESS_SCAN = 20;

/** The most recent run of a job that actually succeeded (fully or partially).
 * Broken `partial` runs (Task #75) are skipped. */
export async function getLastSuccessfulRun(job: JobName): Promise<JobRunView | null> {
  const rows = await prisma.jobRun.findMany({
    where: { job, status: { in: ["success", "partial"] } },
    orderBy: { startedAt: "desc" },
    take: LAST_SUCCESS_SCAN,
    select: RUN_VIEW_SELECT,
  });
  return rows.map(toView).find((r) => r.status !== "failure") ?? null;
}

export interface PipelineHealth {
  lastRun: JobRunView | null;
  lastSuccess: JobRunView | null;
  /** True when the latest run failed outright — the UI surfaces this. */
  isFailing: boolean;
}

export async function getPipelineHealth(job: JobName): Promise<PipelineHealth> {
  const [lastRun, lastSuccess] = await Promise.all([getLastRun(job), getLastSuccessfulRun(job)]);
  return {
    lastRun,
    lastSuccess,
    isFailing: lastRun?.status === "failure",
  };
}

/** Recent run history, newest first (for an ops/debug view). */
export async function getRecentJobRuns(job: JobName, limit = 20): Promise<JobRunView[]> {
  const rows = await prisma.jobRun.findMany({
    where: { job },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: RUN_VIEW_SELECT,
  });
  return rows.map(toView);
}

export interface DiscoveryRun {
  startedAt: Date;
  /** New games that run added (from its summary). */
  newGames: number | null;
}

/**
 * The latest collect run that did discovery (Task #66). New games only enter
 * through discovery, and the scheduled collector runs known-only, so this is
 * what "how fresh is the new-releases list" depends on. Runs record
 * `discoveryRan` since Task #66; older rows count if they found anything.
 */
export async function getLastDiscoveryRun(): Promise<DiscoveryRun | null> {
  const rows = await prisma.$queryRaw<{ startedAt: Date | string; newGames: number | null }[]>`
    SELECT "startedAt", json_extract("summary", '$.newGames') AS "newGames"
    FROM "JobRun"
    WHERE "job" = 'collect' AND "status" IN ('success', 'partial') AND "summary" IS NOT NULL
      AND (
        json_extract("summary", '$.discoveryRan') = 1
        OR (json_extract("summary", '$.discoveryRan') IS NULL
            AND json_extract("summary", '$.discovered') > 0)
      )
    ORDER BY "startedAt" DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    startedAt: new Date(row.startedAt),
    newGames: row.newGames === null ? null : Number(row.newGames),
  };
}
