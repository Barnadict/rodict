/**
 * Copy a whole libsql/SQLite database into a local SQLite file (Task #50).
 *
 * The off-site backup of the hosted Turso DB is a plain SQLite file, not a
 * logical dump: restoring it is "gunzip, point DATABASE_URL at it", and the copy
 * includes `_prisma_migrations`, so Prisma sees exactly the schema it expects.
 *
 * Rows are paged by rowid (keyset), never by OFFSET: on Turso every row an
 * OFFSET skips is still a billed row read, which at ~1.2M snapshots would read
 * ~140M rows per backup instead of ~1.2M.
 */

import type { Client, InValue } from "@libsql/client";

const PAGE = 5000;

export interface CopyResult {
  counts: Record<string, number>;
  totalRows: number;
}

/** Tables and indexes to recreate, in creation order (tables first). */
async function schema(src: Client) {
  const rs = await src.execute(
    "SELECT type, name, sql FROM sqlite_master " +
      "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' " +
      "ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid",
  );
  return rs.rows.map((r) => ({
    type: String(r.type),
    name: String(r.name),
    sql: String(r.sql),
  }));
}

/**
 * Copy every table of `src` into the empty database `dest`. `log` receives
 * progress lines. Foreign keys are not enforced during the copy (tables load in
 * any order); `verifyCopy` checks the result afterwards.
 */
export async function copyDatabase(
  src: Client,
  dest: Client,
  log: (line: string) => void = () => {},
): Promise<CopyResult> {
  const objects = await schema(src);
  await dest.execute("PRAGMA foreign_keys = OFF");
  // Tables first, rows next, indexes last: filling a table before indexing it
  // is much faster than maintaining the indexes row by row.
  for (const o of objects) if (o.type === "table") await dest.execute(o.sql);

  const counts: Record<string, number> = {};
  for (const { name } of objects.filter((o) => o.type === "table")) {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    let lastRowid: InValue = -1;
    let copied = 0;
    for (;;) {
      const page = await src.execute({
        sql: `SELECT rowid AS __rowid, * FROM ${quoted} WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`,
        args: [lastRowid],
      });
      if (page.rows.length === 0) break;
      const columns = page.columns.slice(1); // drop __rowid
      const insert =
        `INSERT INTO ${quoted} (${columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ")}) ` +
        `VALUES (${columns.map(() => "?").join(", ")})`;
      await dest.batch(
        page.rows.map((row) => ({
          sql: insert,
          args: columns.map((_, i) => row[i + 1] as InValue),
        })),
        "write",
      );
      copied += page.rows.length;
      lastRowid = page.rows[page.rows.length - 1][0] as InValue;
      if (page.rows.length < PAGE) break;
    }
    counts[name] = copied;
    log(`  ${name}: ${copied.toLocaleString("en-US")} rows`);
  }

  for (const o of objects) if (o.type !== "table") await dest.execute(o.sql);
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, totalRows };
}

/**
 * Check a finished copy: SQLite's integrity check passes and every table holds
 * exactly the rows the copy reported. Throws on either, so a broken backup fails
 * the workflow loudly. Returns warnings for dangling foreign keys instead of
 * throwing: tables are copied one after another, so a collector run that
 * overlaps the backup can leave a few snapshots whose new game was inserted
 * after the Game table was copied. That copy is still worth keeping.
 */
export async function verifyCopy(
  dest: Client,
  expected: Record<string, number>,
): Promise<string[]> {
  const integrity = await dest.execute("PRAGMA integrity_check");
  const status = String(integrity.rows[0]?.[0]);
  if (status !== "ok") throw new Error(`integrity_check failed: ${status}`);

  for (const [table, n] of Object.entries(expected)) {
    const rs = await dest.execute(`SELECT COUNT(*) FROM "${table.replace(/"/g, '""')}"`);
    const got = Number(rs.rows[0][0]);
    if (got !== n) throw new Error(`${table}: copied ${n} rows but the copy holds ${got}`);
  }

  const fk = await dest.execute("PRAGMA foreign_key_check");
  return fk.rows.length > 0
    ? [`${fk.rows.length} dangling foreign key reference(s) — a run overlapped the backup`]
    : [];
}
