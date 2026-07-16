import { prisma } from "@/lib/prisma";

/**
 * Run history for the collector / analytics pipelines (Task #34).
 *
 * Every run records a row here — including failed ones — so the UI can tell
 * "data is stale because nothing ran" apart from "data is stale because the
 * last run failed", and so failures leave a trace beyond the CI logs.
 */

export type JobName = "collect" | "analytics";
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

/** The most recent run of a job, whatever its outcome. */
export function getLastRun(job: JobName): Promise<JobRunView | null> {
  return prisma.jobRun.findFirst({
    where: { job },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      job: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      error: true,
    },
  });
}

/** The most recent run of a job that actually succeeded (fully or partially). */
export function getLastSuccessfulRun(job: JobName): Promise<JobRunView | null> {
  return prisma.jobRun.findFirst({
    where: { job, status: { in: ["success", "partial"] } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      job: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      error: true,
    },
  });
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
export function getRecentJobRuns(job: JobName, limit = 20): Promise<JobRunView[]> {
  return prisma.jobRun.findMany({
    where: { job },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      job: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      durationMs: true,
      error: true,
    },
  });
}
