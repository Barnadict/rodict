/**
 * Retention/downsampling run (Task #11):
 *   npm run db:retention [-- --dry-run --no-backup --allow-remote]
 *
 * By default it backs up FIRST, then downsamples — so a downsample is always
 * recoverable. `--dry-run` only counts what would be deleted.
 *
 * Deliberately unscheduled (Task #48): on the hosted Turso DB every deleted row
 * counts against the monthly write cap, and storage is nowhere near its cap. It
 * refuses to run against a hosted DB without `--allow-remote` — and the policy
 * needs fixing before that's ever worth doing (see policy.ts).
 */
import "dotenv/config";

import { downsampleSnapshots } from "../src/lib/retention/downsample";
import { exportBackup } from "../src/lib/retention/backup";

async function main() {
  const skipBackup = process.argv.includes("--no-backup");
  const dryRun = process.argv.includes("--dry-run");
  const isRemote = /^(libsql|https|wss):\/\//.test(process.env.DATABASE_URL ?? "");
  if (isRemote && !dryRun && !process.argv.includes("--allow-remote")) {
    console.error(
      "Refusing to prune a hosted DB: every deleted snapshot is a billed Turso write " +
        "(Task #48). Use --dry-run to see the cost, or --allow-remote to proceed anyway.",
    );
    process.exit(1);
  }

  if (dryRun) {
    const result = await downsampleSnapshots(undefined, undefined, { dryRun: true });
    console.log(
      `Dry run — would delete ${result.snapshotsDeleted} of ${result.snapshotsScanned} ` +
        `snapshots past the hourly window (= ${result.snapshotsDeleted} rows written).`,
    );
    return;
  }

  if (!skipBackup) {
    console.log("Backing up before downsample...");
    const manifest = await exportBackup();
    console.log(`Backup written to ${manifest.dir} (${manifest.totalRows} rows).`);
  }

  console.log("Downsampling snapshots...");
  const result = await downsampleSnapshots();
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `Done — scanned ${result.snapshotsScanned}, deleted ${result.snapshotsDeleted} across ${result.gamesProcessed} game(s).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
