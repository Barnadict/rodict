/**
 * Periodic DB export/backup (Task #11). Accumulated snapshots are IRREPLACEABLE
 * — Roblox APIs only return "now", so a lost DB means the history is gone for
 * good. This writes a logical dump (one NDJSON file per table + a manifest),
 * which works identically for local SQLite and the hosted Turso DB (Task #30) —
 * unlike copying the .db file, which is SQLite-only.
 *
 * Server/script-only (uses node:fs). Run via `npm run db:backup`.
 */

import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/db/serialize";

const PAGE = 5000;

type FetchPage = (skip: number, take: number) => Promise<unknown[]>;

async function dumpTable(dir: string, name: string, fetchPage: FetchPage): Promise<number> {
  const stream = createWriteStream(path.join(dir, `${name}.ndjson`));
  let skip = 0;
  let total = 0;
  try {
    for (;;) {
      const rows = await fetchPage(skip, PAGE);
      for (const row of rows) stream.write(JSON.stringify(jsonSafe(row)) + "\n");
      total += rows.length;
      if (rows.length < PAGE) break;
      skip += PAGE;
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
      stream.end();
    });
  }
  return total;
}

export interface BackupManifest {
  createdAt: string;
  dir: string;
  counts: Record<string, number>;
  totalRows: number;
}

export async function exportBackup(destDir?: string): Promise<BackupManifest> {
  const createdAt = new Date().toISOString();
  const dir = destDir ?? path.join("backups", createdAt.replace(/[:.]/g, "-"));
  await mkdir(dir, { recursive: true });

  const counts: Record<string, number> = {
    Game: await dumpTable(dir, "Game", (skip, take) =>
      prisma.game.findMany({ skip, take, orderBy: { id: "asc" } }),
    ),
    GameSnapshot: await dumpTable(dir, "GameSnapshot", (skip, take) =>
      prisma.gameSnapshot.findMany({ skip, take, orderBy: { id: "asc" } }),
    ),
    GenreSnapshot: await dumpTable(dir, "GenreSnapshot", (skip, take) =>
      prisma.genreSnapshot.findMany({ skip, take, orderBy: { id: "asc" } }),
    ),
    GameGenreHistory: await dumpTable(dir, "GameGenreHistory", (skip, take) =>
      prisma.gameGenreHistory.findMany({ skip, take, orderBy: { id: "asc" } }),
    ),
    Genre: await dumpTable(dir, "Genre", (skip, take) =>
      prisma.genre.findMany({ skip, take, orderBy: { id: "asc" } }),
    ),
    Theme: await dumpTable(dir, "Theme", (skip, take) =>
      prisma.theme.findMany({ skip, take, orderBy: { id: "asc" } }),
    ),
    GameTheme: await dumpTable(dir, "GameTheme", (skip, take) =>
      prisma.gameTheme.findMany({ skip, take, orderBy: [{ gameId: "asc" }, { themeId: "asc" }] }),
    ),
    AnalyticsResult: await dumpTable(dir, "AnalyticsResult", (skip, take) =>
      prisma.analyticsResult.findMany({ skip, take, orderBy: { id: "asc" } }),
    ),
  };

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  const manifest: BackupManifest = { createdAt, dir, counts, totalRows };
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
