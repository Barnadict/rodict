/**
 * Deploy pending migrations to the hosted Turso DB (Task #30).
 *
 * `prisma migrate deploy` can't be used here: Prisma's schema engine only
 * recognizes native connection schemes (postgresql:, mysql:, file:, ...) for
 * migrate/introspect commands — it rejects `libsql://` with P1013, even though
 * the libSQL *driver adapter* (used by PrismaClient at runtime) understands it
 * fine. So this script applies each migration's raw SQL directly over
 * `@libsql/client` and records it in a `_prisma_migrations` table shaped like
 * Prisma's own, so the history stays legible (and forward-compatible if a
 * future Prisma version adds adapter support to migrate).
 *
 * Usage: DATABASE_URL=... DATABASE_AUTH_TOKEN=... npm run db:deploy
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@libsql/client";

const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  if (!url || url.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL must point at the hosted Turso DB (libsql://...), not a local file: URL.",
    );
  }

  const client = createClient({ url, authToken });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  const applied = await client.execute(`SELECT "migration_name" FROM "_prisma_migrations"`);
  const appliedNames = new Set(applied.rows.map((r) => r.migration_name as string));

  const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let deployed = 0;
  for (const name of migrationDirs) {
    if (appliedNames.has(name)) {
      console.log(`  skip    ${name} (already applied)`);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const id = createHash("sha256").update(`${name}:${Date.now()}`).digest("hex").slice(0, 25);

    await client.executeMultiple(sql);
    await client.execute({
      sql: `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count") VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)`,
      args: [id, checksum, name],
    });

    console.log(`  applied ${name}`);
    deployed++;
  }

  console.log(`\nDone — ${deployed} migration(s) applied, ${migrationDirs.length - deployed} already up to date.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
