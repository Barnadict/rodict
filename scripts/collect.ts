/**
 * Manual collector run (Task #8): `npm run collect [-- --max=N --known-only]`.
 *
 * Local scheduling (cron / node-cron) so history accumulates during dev is
 * Task #12; cloud automation (GitHub Actions) is Task #32.
 */
import "dotenv/config";

import { runCollection } from "../src/lib/collector/collect";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  const max = arg("max");
  const knownOnly = process.argv.includes("--known-only");

  console.log("Starting collection...");
  const summary = await runCollection({
    maxGames: max ? Number(max) : undefined,
    knownOnly,
  });

  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length) {
    console.error(`\n${summary.errors.length} per-game error(s).`);
  }
  console.log(
    `\nDone in ${(summary.durationMs / 1000).toFixed(1)}s — persisted ${summary.persisted} games (${summary.newGames} new).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
