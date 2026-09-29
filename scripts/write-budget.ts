/**
 * Write-budget report (Task #42): month-to-date Turso row writes, summed from
 * the per-run counts both pipelines record in `JobRun.summary.writes`, and a
 * month-end projection against the free plan's cap. Also measures the low-CCU
 * share of the tracked corpus, which sizes tiered collection (Task #46).
 *
 *   npm run db:write-budget                      # local dev.db
 *   npm run db:write-budget -- --prod            # hosted Turso (.env.production.local)
 *   npm run db:write-budget -- --collect-per-day=8 --analytics-per-day=2
 *
 * Also reports database storage against the plan's cap — the number that
 * decides whether snapshot retention/pruning is worth its writes (Task #48).
 *
 * Read-only: it never writes, so it costs no write budget (reads are a few
 * thousand rows — the month's JobRuns plus one scan of Game).
 *
 * Runs recorded before #42 carry no counts. They're reported as "unmeasured"
 * rather than guessed at, so the projection only rests on measured runs.
 */
import { config } from "dotenv";

const prod = process.argv.includes("--prod");
// Load the env BEFORE anything constructs the Prisma client (it reads
// process.env at construction), exactly as collect-prod.ts does.
config(prod ? { path: ".env.production.local", override: true } : undefined);

function numArg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
}

const LOW_CCU = 50; // Task #46's proposed busy/low-activity split

const fmt = (n: number | null) => (n === null ? "n/a" : Math.round(n).toLocaleString("en-US"));
const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(1)}%`;

async function main() {
  if (prod && !/^(libsql|https|wss):\/\//.test(process.env.DATABASE_URL ?? "")) {
    console.error(
      "Refusing --prod: DATABASE_URL in .env.production.local is not a hosted Turso URL.",
    );
    process.exit(1);
  }
  const { prisma } = await import("../src/lib/prisma");
  const { TURSO_FREE_PLAN } = await import("../src/lib/db/write-counts");
  const { getDatabaseSizeBytes, getMonthWriteBudget, PRODUCTION_SCHEDULE } =
    await import("../src/lib/db/write-budget");
  const { BUDGET_GUARD } = await import("../src/lib/collector/budget-guard");

  // Default schedule = what the workflows run today (collect every 3h,
  // analytics twice a day).
  const runsPerDay = {
    collect: numArg("collect-per-day", PRODUCTION_SCHEDULE.collect),
    analytics: numArg("analytics-per-day", PRODUCTION_SCHEDULE.analytics),
  };

  const now = new Date();
  const report = await getMonthWriteBudget(now, runsPerDay);

  const cap = TURSO_FREE_PLAN.rowsWrittenPerMonth;
  const readCap = TURSO_FREE_PLAN.rowsReadPerMonth;
  console.log(`Write budget — ${prod ? "PRODUCTION (Turso)" : "local DB"}`);
  console.log(
    `Month: ${report.monthStart.toISOString().slice(0, 7)} ` +
      `(day ${report.daysElapsed.toFixed(1)} of ${report.daysInMonth})`,
  );
  console.log(
    `Free-plan caps (checked ${TURSO_FREE_PLAN.checkedOn}): ${fmt(cap)} rows written, ` +
      `${fmt(readCap)} rows read, ${TURSO_FREE_PLAN.storageBytes / 1024 ** 3} GB storage\n`,
  );

  for (const [job, j] of Object.entries(report.jobs)) {
    console.log(
      `  ${job.padEnd(10)} ${j.runs} run(s), ${j.measuredRuns} measured — ` +
        `${fmt(j.measuredWrites)} rows written, avg ${fmt(j.avgWritesPerRun)}/run` +
        (j.avgRowsLoadedPerRun !== null
          ? `, avg ${fmt(j.avgRowsLoadedPerRun)} rows loaded/run`
          : ""),
    );
  }
  if (Object.keys(report.jobs).length === 0) console.log("  (no runs recorded this month)");

  console.log(
    `\nMeasured writes to date: ${fmt(report.measuredWritesToDate)} (${pct(report.measuredWritesToDate, cap)} of cap)`,
  );
  if (report.unmeasuredRuns) {
    console.log(
      `  + ${report.unmeasuredRuns} run(s) from before write counting (Task #42) — not included. ` +
        `Turso's dashboard shows the true month-to-date total.`,
    );
  }
  console.log(
    `Schedule used for projection: collect ${runsPerDay.collect}/day, analytics ${runsPerDay.analytics}/day`,
  );
  if (report.projectedMonthWrites === null) {
    console.log("Projection: n/a — needs at least one measured run of every scheduled job.");
  } else {
    console.log(
      `Projected month-end writes (Est.): ${fmt(report.projectedMonthWrites)} ` +
        `(${pct(report.projectedMonthWrites, cap)} of cap)`,
    );
    console.log(
      `A full month on this schedule (Est.): ${fmt(report.fullMonthWritesAtSchedule)} ` +
        `(${pct(report.fullMonthWritesAtSchedule!, cap)} of cap)`,
    );
  }
  console.log(
    `Collector budget guard (Task #47): busy-tier only above ${BUDGET_GUARD.reduceAt * 100}% ` +
      `projected, paused above ${BUDGET_GUARD.pauseAt * 100}% written.`,
  );
  if (report.fullMonthAnalyticsReadsAtSchedule !== null) {
    console.log(
      `Analytics reads, full month on this schedule (Est.): ${fmt(report.fullMonthAnalyticsReadsAtSchedule)} ` +
        `(${pct(report.fullMonthAnalyticsReadsAtSchedule, readCap)} of read cap)`,
    );
  }

  // Low-CCU share, for tiered collection (#46).
  const [total, low, zero, dead] = await Promise.all([
    prisma.game.count(),
    prisma.game.count({ where: { currentPlaying: { lt: LOW_CCU } } }),
    prisma.game.count({ where: { currentPlaying: 0 } }),
    prisma.game.count({ where: { status: "dead" } }),
  ]);
  console.log(`\nTracked games: ${fmt(total)}`);
  if (total) {
    console.log(`  below ${LOW_CCU} CCU: ${fmt(low)} (${pct(low, total)})`);
    console.log(`  at 0 CCU:       ${fmt(zero)} (${pct(zero, total)})`);
    console.log(`  status "dead":  ${fmt(dead)} (${pct(dead, total)})`);
  }

  // Storage (Task #48): pruning snapshots costs one write per deleted row, so
  // it's only worth it when storage, not writes, is the closer limit.
  const bytes = await getDatabaseSizeBytes();
  const snapshots = await prisma.gameSnapshot.count();
  const storageCap = TURSO_FREE_PLAN.storageBytes;
  const mb = (n: number) => `${(n / 1024 ** 2).toFixed(0)} MB`;
  console.log(`\nStorage: ${mb(bytes)} of ${mb(storageCap)} (${pct(bytes, storageCap)} of cap)`);
  const collectPerRun = report.jobs.collect?.avgWritesPerRun;
  if (snapshots && collectPerRun && runsPerDay.collect > 0) {
    // Growth ≈ snapshot inserts per month × bytes per snapshot. About half of
    // collect writes are GameSnapshot inserts (one per game; the other half are
    // the matching Game updates). bytesPerRow spreads every table's bytes over
    // the snapshots, so this leans high (Est.).
    const bytesPerRow = bytes / snapshots;
    const growthPerMonth = (collectPerRun / 2) * runsPerDay.collect * 30 * bytesPerRow;
    const months = (storageCap - bytes) / growthPerMonth;
    console.log(
      `  ~${fmt(bytesPerRow)} bytes per snapshot incl. indexes; growth ~${mb(growthPerMonth)}/month ` +
        `→ cap in ~${months.toFixed(0)} months (Est.)`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
