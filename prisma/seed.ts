/**
 * Seeds the normalized genre + theme taxonomy (Task #5) into the DB.
 *
 * Idempotent: upserts by `slug`, so re-running keeps the DB in sync with the
 * source-of-truth lists in src/lib/taxonomy without creating duplicates. It does
 * NOT delete genres/themes removed from those lists (games may still reference
 * them) — retire one by removing it from the list and, if needed, flipping
 * `isActive` by hand.
 *
 * Run: `npm run db:seed` (also runs automatically after `prisma migrate reset`).
 */
import "dotenv/config";

import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../src/generated/prisma/client";
import { GENRES } from "../src/lib/taxonomy/genres";
import { THEMES } from "../src/lib/taxonomy/themes";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const [index, genre] of GENRES.entries()) {
    await prisma.genre.upsert({
      where: { slug: genre.slug },
      update: {
        name: genre.name,
        description: genre.description,
        sortOrder: index,
        isActive: true,
      },
      create: {
        slug: genre.slug,
        name: genre.name,
        description: genre.description,
        sortOrder: index,
      },
    });
  }

  for (const theme of THEMES) {
    await prisma.theme.upsert({
      where: { slug: theme.slug },
      update: { name: theme.name, isActive: true },
      create: { slug: theme.slug, name: theme.name },
    });
  }

  const [genres, themes] = await Promise.all([prisma.genre.count(), prisma.theme.count()]);
  console.log(`Seeded taxonomy: ${genres} genres, ${themes} themes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
