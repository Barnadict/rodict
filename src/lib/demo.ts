/**
 * Demo mode: the site reads the bundled snapshot in `data/demo.db` instead of
 * the hosted DB. Set `DATABASE_URL="file:./data/demo.db"` to turn it on.
 *
 * The snapshot is a copy of a local dev DB: each game's latest reading is real,
 * but the history before it comes from `scripts/dev-backfill.ts` and is
 * invented.
 */
export const IS_DEMO_DATA = /(^|[\\/])demo\.db$/.test(process.env.DATABASE_URL ?? "");
