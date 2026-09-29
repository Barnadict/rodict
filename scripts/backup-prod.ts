/**
 * Off-site backup of the hosted Turso DB (Task #50):
 *   npm run db:backup:prod [-- --out=<dir>]
 *
 * Copies every table into a fresh local SQLite file (src/lib/retention/
 * sqlite-copy.ts), verifies it, and gzips it to
 * `<dir>/rodict-prod-<timestamp>.db.gz` plus a `manifest.json`. The weekly
 * backup workflow (.github/workflows/backup.yml) uploads both as a release in a
 * private repo.
 *
 * Restore: download the .db.gz, gunzip it, and point DATABASE_URL at
 * `file:./<name>.db`. It's an ordinary SQLite file with `_prisma_migrations`,
 * so the app and `prisma migrate` work against it as-is.
 *
 * Read-only against production: ~1 read per row (~1.2M rows as of 2026-09),
 * about 1% of the monthly read cap at one backup a week. No writes.
 *
 * Credentials: DATABASE_URL / DATABASE_AUTH_TOKEN from the environment (CI
 * secrets) or, locally, `.env.production.local`.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { createClient } from "@libsql/client";
import { config } from "dotenv";

import { copyDatabase, verifyCopy } from "../src/lib/retention/sqlite-copy";

// CI passes the secrets as env vars; locally they live in .env.production.local.
if (!process.env.DATABASE_URL) config({ path: ".env.production.local", quiet: true });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^(libsql|https|wss):\/\//.test(url)) {
    console.error("Refusing: DATABASE_URL is not a hosted Turso URL (this backs up production).");
    process.exit(1);
  }

  const outDir = arg("out") ?? "backups";
  await mkdir(outDir, { recursive: true });
  const createdAt = new Date();
  const base = `rodict-prod-${createdAt.toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
  const dbPath = path.join(outDir, `${base}.db`);
  const gzPath = `${dbPath}.gz`;
  await rm(dbPath, { force: true });

  // intMode "bigint" keeps 64-bit integers (e.g. visits) exact through the copy.
  const src = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
    intMode: "bigint",
  });
  const dest = createClient({ url: `file:${dbPath}`, intMode: "bigint" });

  console.log(`Copying ${url.replace(/\?.*$/, "")} → ${dbPath}`);
  const started = Date.now();
  const { counts, totalRows } = await copyDatabase(src, dest, (line) => console.log(line));
  const warnings = await verifyCopy(dest, counts);
  for (const w of warnings) console.warn(`::warning::${w}`);
  dest.close();
  src.close();

  await pipeline(createReadStream(dbPath), createGzip({ level: 9 }), createWriteStream(gzPath));
  const [raw, gz] = await Promise.all([stat(dbPath), stat(gzPath)]);
  await rm(dbPath);

  const manifest = {
    createdAt: createdAt.toISOString(),
    file: path.basename(gzPath),
    counts,
    totalRows,
    rawBytes: raw.size,
    gzipBytes: gz.size,
    warnings,
  };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  const mb = (n: number) => `${(n / 1024 ** 2).toFixed(1)} MB`;
  console.log(
    `\nVerified ${totalRows.toLocaleString("en-US")} rows in ${((Date.now() - started) / 1000).toFixed(0)}s` +
      ` — ${mb(raw.size)} raw, ${mb(gz.size)} gzipped → ${gzPath}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
