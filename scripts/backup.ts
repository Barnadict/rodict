/**
 * Standalone DB backup (Task #11): `npm run db:backup [-- <dest-dir>]`.
 * Writes a logical NDJSON dump + manifest of the whole DB.
 */
import "dotenv/config";

import { exportBackup } from "../src/lib/retention/backup";

async function main() {
  const dest = process.argv.find((a) => !a.startsWith("--") && a.endsWith("/"))
    ? process.argv[process.argv.length - 1]
    : undefined;

  console.log("Exporting backup...");
  const manifest = await exportBackup(dest);
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`\nBackup written to ${manifest.dir} — ${manifest.totalRows} rows total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
