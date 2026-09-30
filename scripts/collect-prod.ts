/**
 * Production collector run — writes ONLY to the hosted Turso DB.
 *
 * Run this from a residential IP (your own machine) to work around the
 * datacenter-IP rate-limiting that throttles discovery on the GitHub Actions
 * runner (PROJECT_PLAN's #1 risk). Discovery from a home IP is far less likely
 * to be 429'd, so this run should find many more new games than the cron does.
 *
 * It never touches the local dev.db: it loads DATABASE_URL / DATABASE_AUTH_TOKEN
 * from `.env.production.local` and REFUSES to run if that URL isn't a hosted
 * (libsql/https) target — so a stray `file:` URL can't silently write locally.
 *
 * The run is purely additive to production: it appends one fresh snapshot per
 * game and inserts newly discovered games. It does not wipe games or history.
 *
 *   npm run collect:prod                 # full discovery + re-collect known
 *   npm run collect:prod -- --known-only # skip discovery, only refresh known
 *   npm run collect:prod -- --all        # ignore the tiered cadence (Task #46)
 *   npm run collect:prod -- --max=200    # cap games (a quick smoke run)
 *   npm run collect:prod -- --ignore-budget  # skip the write-budget guard (Task #47)
 */
import { config } from "dotenv";

// Load the PRODUCTION env before anything imports the Prisma client (which reads
// process.env at construction time). `override: true` makes it win over any
// DATABASE_URL already present in the shell or a plain `.env`.
config({ path: ".env.production.local", override: true });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const token = process.env.DATABASE_AUTH_TOKEN ?? "";
  const isRemote = /^(libsql|https|wss):\/\//.test(url);
  // Reject the shipped placeholders too, so an unfilled file gives a clear
  // message instead of a raw connection error against a fake host.
  const isPlaceholder = /[<>]/.test(url) || /[<>]/.test(token) || token.length === 0;
  if (!isRemote || isPlaceholder) {
    console.error(
      `Refusing to run: DATABASE_URL / DATABASE_AUTH_TOKEN are not set to real ` +
        `hosted-Turso values (got URL "${url || "<empty>"}").\n\n` +
        `Fill in .env.production.local (gitignored) with your real credentials:\n` +
        `  DATABASE_URL="libsql://<your-db>.turso.io"\n` +
        `  DATABASE_AUTH_TOKEN="<your-token>"\n\n` +
        `Get them from GitHub → repo Settings → Secrets and variables → Actions, ` +
        `your Vercel env vars, or the Turso dashboard.\n`,
    );
    process.exit(1);
  }

  // Import AFTER the env is set, so the Prisma client constructs against Turso.
  const { collectionJobError, collectionJobStatus, collectionJobSummary, runCollection } =
    await import("../src/lib/collector/collect");
  const { recordJobRun } = await import("../src/lib/db/job-runs");

  const max = arg("max");
  const knownOnly = process.argv.includes("--known-only");
  // Ignore the tiered cadence (Task #46) and re-collect every known game.
  const ignoreCadence = process.argv.includes("--all");
  // Skip the write-budget guard (Task #47). Only for a deliberate manual run.
  const ignoreBudget = process.argv.includes("--ignore-budget");
  const startedAt = new Date();

  const host = url.replace(/\?.*$/, "");
  console.log(`Starting PRODUCTION collection → ${host}`);
  try {
    const summary = await runCollection({
      maxGames: max ? Number(max) : undefined,
      knownOnly,
      ignoreCadence,
      ignoreBudget,
    });

    console.log(JSON.stringify(summary, null, 2));
    if (summary.budgetGuard?.reason) console.warn(`::warning::${summary.budgetGuard.reason}`);
    if (summary.errors.length) {
      console.error(`\n${summary.errors.length} per-game error(s).`);
    }

    // Per-game failures don't abort the run, but a run with skipped batches (or
    // one the write-budget guard reduced, Task #47) is "partial" rather than a
    // clean success, so monitoring can tell them apart.
    const status = collectionJobStatus(summary);
    await recordJobRun({
      job: "collect",
      status,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      summary: collectionJobSummary(summary),
      error: collectionJobError(summary),
    });

    console.log(
      `\nDone in ${(summary.durationMs / 1000).toFixed(1)}s — persisted ${summary.persisted} games ` +
        `(${summary.newGames} new, discovered ${summary.discovered}).`,
    );

    // A run that saved (almost) nothing (Task #75) must turn the workflow red,
    // so the alert job opens an issue. It's recorded above either way.
    if (status === "failure") {
      console.error("::error::Collection saved (almost) nothing — treated as a failed run.");
      process.exitCode = 1;
    }
  } catch (err) {
    // Record the failure before rethrowing, so a crashed run is still visible.
    try {
      await recordJobRun({
        job: "collect",
        status: "failure",
        startedAt,
        finishedAt: new Date(),
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
    } catch (recordErr) {
      console.error("Additionally, failed to record the failed run:", recordErr);
    }
    throw err;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
