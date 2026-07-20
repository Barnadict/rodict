import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 is engine-less by default, so the runtime client connects through a
// driver adapter rather than a connection string alone. We use the libSQL
// adapter because it serves BOTH local dev (a `file:` SQLite DB) and the hosted
// Turso target (Task #30) — same code path, only DATABASE_URL/DATABASE_AUTH_TOKEN
// change.
//
// DATABASE_URL is loaded by Next.js (from .env / .env.local) and by the Prisma
// CLI (via dotenv in prisma.config.ts). DATABASE_AUTH_TOKEN is optional — local
// SQLite doesn't need one; Turso does. (The libSQL client also accepts a token
// embedded as a `?authToken=` query param on the URL itself, so either form works.)
const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// Reuse a single PrismaClient across hot-reloads in dev (Next.js re-evaluates
// modules on every change, which would otherwise open a new connection each
// time). In production a single instance is created per server process.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Interactive transactions ($transaction([...])) default to a 5s timeout. That
// is ample against a local file DB but too tight against a remote Turso target,
// where each statement is a network round trip — a batched write of ~100 row
// updates can exceed 5s and abort the whole run (observed: a full-corpus collect
// tipped over at 5111ms). Raise it so batched writes have real headroom; batches
// are still kept small (TX_BATCH) so no single transaction holds a long lock.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    transactionOptions: { timeout: 30_000, maxWait: 15_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
