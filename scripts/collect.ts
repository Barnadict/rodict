/**
 * Manual collector run (Task #8): `npm run collect [-- --max=N --known-only]`.
 *
 * Local scheduling (cron / node-cron) so history accumulates during dev is
 * Task #12; cloud automation (GitHub Actions) is Task #32.
 *
 * Every run — success or failure — is recorded to the JobRun table (Task #34)
 * so the UI can explain stale data and failures leave a trace beyond CI logs.
 */
import "dotenv/config";

import { runCollection } from "../src/lib/collector/collect";
import { recordJobRun, type JobStatus } from "../src/lib/db/job-runs";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  const max = arg("max");
  const knownOnly = process.argv.includes("--known-only");
  const startedAt = new Date();

  console.log("Starting collection...");
  try {
    const summary = await runCollection({
      maxGames: max ? Number(max) : undefined,
      knownOnly,
    });

    console.log(JSON.stringify(summary, null, 2));
    if (summary.errors.length) {
      console.error(`\n${summary.errors.length} per-game error(s).`);
    }

    // Per-game failures don't abort the run, but they shouldn't be reported as
    // a clean success either — the run is "partial" so monitoring can see it.
    const status: JobStatus = summary.errors.length > 0 ? "partial" : "success";
    await recordJobRun({
      job: "collect",
      status,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      summary: {
        discovered: summary.discovered,
        knownReCollected: summary.knownReCollected,
        persisted: summary.persisted,
        newGames: summary.newGames,
        peaksUpdated: summary.peaksUpdated,
        genreSnapshots: summary.genreSnapshots,
        errorCount: summary.errors.length,
      },
      error: summary.errors.length ? summary.errors.join("\n") : null,
    });

    console.log(
      `\nDone in ${(summary.durationMs / 1000).toFixed(1)}s — persisted ${summary.persisted} games (${summary.newGames} new).`,
    );
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
