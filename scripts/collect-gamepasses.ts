/**
 * Game-pass refresh (Task #69): `npm run collect:gamepasses [-- --shard=N --max=N --ignore-budget]`.
 *
 * Checks the day's shard of active games (one seventh, so every game weekly)
 * and writes only catalogs that are new or changed. Scheduled daily by
 * .github/workflows/gamepasses.yml. Every run is recorded to JobRun, with its
 * row-write count for the write budget (Task #42).
 */
import "dotenv/config";

import {
  passRefreshJobError,
  passRefreshJobSummary,
  passRefreshStatus,
  runPassRefresh,
} from "../src/lib/collector/game-passes";
import { recordJobRun } from "../src/lib/db/job-runs";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  const shard = arg("shard");
  const max = arg("max");
  const startedAt = new Date();
  try {
    const summary = await runPassRefresh({
      shard: shard === undefined ? undefined : Number(shard),
      maxGames: max === undefined ? undefined : Number(max),
      ignoreBudget: process.argv.includes("--ignore-budget"),
    });
    console.log(JSON.stringify(passRefreshJobSummary(summary), null, 2));
    if (summary.budgetGuard?.reason) console.warn(`::warning::${summary.budgetGuard.reason}`);
    await recordJobRun({
      job: "gamepasses",
      status: passRefreshStatus(summary),
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      summary: passRefreshJobSummary(summary),
      error: passRefreshJobError(summary),
    });
    console.log(
      `\nDone in ${(summary.durationMs / 1000).toFixed(1)}s — shard ${summary.shard}: ` +
        `${summary.fetched}/${summary.gamesInShard} fetched, ${summary.inserted} new, ` +
        `${summary.updated} changed, ${summary.unchanged} unchanged.`,
    );
    if (passRefreshStatus(summary) === "failure") process.exitCode = 1;
  } catch (err) {
    try {
      await recordJobRun({
        job: "gamepasses",
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
