/**
 * Manual collector run (Task #8): `npm run collect [-- --max=N --known-only --charts-only --all --ignore-budget --pace]`.
 *
 * `--charts-only` discovers from the explore-api charts but skips keyword
 * search, which is 429'd on GitHub's datacenter IP (Task #94 probe).
 *
 * `--pace` (the scheduled collect.yml runs) skips the run when the month's
 * writes are ahead of the even-pace line (Task #79).
 *
 * Local scheduling (cron / node-cron) so history accumulates during dev is
 * Task #12; cloud automation (GitHub Actions) is Task #32.
 *
 * Every run — success or failure — is recorded to the JobRun table (Task #34)
 * so the UI can explain stale data and failures leave a trace beyond CI logs.
 */
import "dotenv/config";

import {
  collectionJobError,
  collectionJobStatus,
  collectionJobSummary,
  runCollection,
} from "../src/lib/collector/collect";
import { recordJobRun } from "../src/lib/db/job-runs";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  const max = arg("max");
  const knownOnly = process.argv.includes("--known-only");
  const skipSearch = process.argv.includes("--charts-only");
  // Ignore the tiered cadence (Task #46) and re-collect every known game.
  const ignoreCadence = process.argv.includes("--all");
  // Skip the write-budget guard (Task #47). Only for a deliberate manual run.
  const ignoreBudget = process.argv.includes("--ignore-budget");
  // Skip the run when ahead of the month's even-pace line (Task #79).
  const pace = process.argv.includes("--pace");
  const startedAt = new Date();

  console.log("Starting collection...");
  try {
    const summary = await runCollection({
      maxGames: max ? Number(max) : undefined,
      knownOnly,
      skipSearch,
      ignoreCadence,
      ignoreBudget,
      pace,
    });

    console.log(JSON.stringify(summary, null, 2));
    // `::warning::` shows as an annotation on the GitHub Actions run.
    if (summary.budgetGuard?.reason) console.warn(`::warning::${summary.budgetGuard.reason}`);
    if (summary.errors.length) {
      console.error(`\n${summary.errors.length} per-game error(s).`);
    }

    // Per-game failures don't abort the run, but they shouldn't be reported as
    // a clean success either — the run is "partial" so monitoring can see it.
    // So is a run the write-budget guard reduced or paused (Task #47).
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
      `\nDone in ${(summary.durationMs / 1000).toFixed(1)}s — persisted ${summary.persisted} games (${summary.newGames} new).`,
    );

    // A run that saved (almost) nothing (Task #75) must turn the workflow red,
    // so the alert job opens an issue. It's recorded above either way.
    if (status === "failure") {
      console.error("::error::Collection saved (almost) nothing — treated as a failed run.");
      process.exitCode = 1;
    }
  } catch (err) {
    // Record the failure before rethrowing, so a crashed run is still visible.
    // A failure while recording the failure must not mask the original error.
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
