/**
 * Retention/downsampling run (Task #11): `npm run db:retention [-- --no-backup]`.
 *
 * By default it backs up FIRST, then downsamples — so a downsample is always
 * recoverable. Scheduling (cron) lands with the collector's scheduling in
 * Task #12 (local) / Task #33 (cloud).
 */
import "dotenv/config";

import { downsampleSnapshots } from "../src/lib/retention/downsample";
import { exportBackup } from "../src/lib/retention/backup";

async function main() {
  const skipBackup = process.argv.includes("--no-backup");

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
