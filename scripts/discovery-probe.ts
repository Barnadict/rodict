/**
 * Discovery probe (Task #94): `npm run collect:probe [-- --pages=N --chart-pages=N]`.
 *
 * Walks every discovery source separately and records per-source results and
 * 429s in a `discovery-probe` JobRun, without persisting any games. Run from
 * Actions (discovery-probe.yml) to see which sources work on a datacenter IP.
 */
import "dotenv/config";

import { discoveryProbeJobSummary, runDiscoveryProbe } from "../src/lib/collector/discovery-probe";
import { recordJobRun } from "../src/lib/db/job-runs";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  const pages = arg("pages");
  const chartPages = arg("chart-pages");
  const startedAt = new Date();
  try {
    const summary = await runDiscoveryProbe({
      pagesPerQuery: pages === undefined ? undefined : Number(pages),
      chartPages: chartPages === undefined ? undefined : Number(chartPages),
    });
    const job = discoveryProbeJobSummary(summary);
    console.table(
      summary.sources.map(
        ({ source, pages, games, newGames, http429, otherErrors, error, ms }) => ({
          source,
          pages,
          games,
          newGames,
          http429,
          otherErrors,
          error: error ?? "",
          s: (ms / 1000).toFixed(1),
        }),
      ),
    );
    console.log(
      `\n${job.workingSources}/${job.sourceCount} sources returned games; ` +
        `${job.newGamesDistinct} distinct new games; ${job.http429} 429 responses; ` +
        `${(summary.durationMs / 1000).toFixed(1)}s.`,
    );
    await recordJobRun({
      job: "discovery-probe",
      // A probe that ran is a success, whatever it found: the finding is the result.
      status: summary.errors.length ? "partial" : "success",
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      summary: job,
      error: summary.errors.length ? summary.errors.join("\n") : null,
    });
  } catch (err) {
    try {
      await recordJobRun({
        job: "discovery-probe",
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
