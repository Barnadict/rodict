import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 is engine-less by default, so the runtime client connects through a
// driver adapter rather than a connection string alone. We use the libSQL
// adapter because it serves BOTH local dev (a `file:` SQLite DB) and the hosted
// Turso target (Task #30) — same code path, only DATABASE_URL changes.
//
// DATABASE_URL is loaded by Next.js (from .env / .env.local) and by the Prisma
// CLI (via dotenv in prisma.config.ts).
const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "" });

// Reuse a single PrismaClient across hot-reloads in dev (Next.js re-evaluates
// modules on every change, which would otherwise open a new connection each
// time). In production a single instance is created per server process.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
