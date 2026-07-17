# rodict

A website for Roblox developers to spot game genres and trends worth building
next — concurrent players, genre popularity, earnings estimates, and how long
a genre tends to last before dying off. It shows statistics; it never tells
you what to build.

Reference sites: [romonitorstats.com](https://romonitorstats.com/), [rolimons.com/games](https://www.rolimons.com/games).

## Stack

- **Next.js** (App Router, Turbopack, **Cache Components**) + TypeScript + Tailwind + shadcn/ui (Base UI primitives)
- **Prisma** (engine-less, driver adapters) — SQLite locally, [Turso](https://turso.tech/) (libSQL) hosted
- **Recharts** for charts
- A **Node collector** (`scripts/collect.ts`) that pulls game data from Roblox's public APIs on a schedule
- A **Python analytics package** (`analytics/`) — lifelines, scikit-learn, pandas — that precomputes survival curves, momentum, clustering, opportunity scores, anomalies, correlation/feature importance, cohorts, seasonality, and short-term forecasts into an `AnalyticsResult` table. The frontend only reads these; nothing statistical runs per-request.

## Rendering & caching

`cacheComponents` is on, so every route is **partially prerendered**: a static
shell is served immediately and only genuinely per-request content streams in.

Each page's DB reads live in a `use cache` loader beside the page, at
`cacheLife("hours")` — the collector only writes every 3h, so re-querying per
request bought latency and DB reads and nothing else. Two rules make it work:

- **Cache on the range _key_, never a `Date`.** A cutoff derived from `now` and
  passed in as an argument is a new cache key every request, so the cache would
  never hit. The loaders take `RangeKey` and derive the cutoff inside.
- **The freshness indicator stays live.** `DataFreshness` calls `connection()`
  and streams, so a cached page never claims to be fresher than it is.

Caches are in-memory (`use cache`). If Turso reads ever become the bottleneck,
`use cache: remote` is the upgrade path — it's deliberately not used yet, since
the search-filtered views that would need it have near-unique keys anyway.

See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) for the full task-by-task build log and the locked design decisions (survivorship-bias guard, dead-game rule, genre taxonomy).

## Getting started

```bash
npm install
cp .env.example .env        # DATABASE_URL="file:./dev.db" for local dev
npm run db:migrate
npm run db:seed             # genre/theme taxonomy
npm run dev
```

To start accumulating real history, run the collector:

```bash
npm run collect
```

For the analytics jobs (optional locally — needs Python 3.10+):

```bash
python -m venv analytics/.venv
analytics/.venv/Scripts/python -m pip install -r analytics/requirements.txt   # Windows
npm run analytics
```

See [`analytics/README.md`](analytics/README.md) for details on each job and cold-start behavior.

## Tests

```bash
npm test        # Vitest — earnings model, validation layer, stats/retention helpers
npm run test:py # pytest — the Python analytics jobs' statistical helpers
```

Both suites are pure-function only: no DB, no network, no fixtures to keep in
sync. Every page is an async Server Component, which Next's own testing guide
says to cover with E2E rather than unit tests, so the suites target the logic
those pages call instead.

## Scripts

| Script                 | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                        |
| `npm run build`        | Production build                                            |
| `npm run lint`         | ESLint                                                      |
| `npm test`             | Run the Vitest suite (`npm run test:watch` to watch)        |
| `npm run test:py`      | Run the Python analytics tests (pytest)                     |
| `npm run collect`      | Run the data collector once (`-- --max=N`, `--known-only`)  |
| `npm run analytics`    | Run all 9 Python analytics jobs                             |
| `npm run db:migrate`   | Create/apply a local migration                              |
| `npm run db:deploy`    | Apply pending migrations to the hosted Turso DB             |
| `npm run db:seed`      | Seed the genre/theme taxonomy                               |
| `npm run db:backup`    | Back up the local SQLite file                               |
| `npm run db:retention` | Downsample/prune old snapshots                              |

## Deployment

- **DB:** hosted on Turso; `DATABASE_URL`/`DATABASE_AUTH_TOKEN` live **only** in GitHub Actions secrets and Vercel's env vars — never in a local `.env`, never committed.
- **Migrations:** `npm run db:migrate` only touches your local SQLite file. To apply a migration to Turso, run the **"Deploy migrations"** workflow ([`migrate.yml`](.github/workflows/migrate.yml)) from the Actions tab — manual trigger, idempotent, and the credentials never leave GitHub. Running `npm run db:deploy` locally fails by design (`DATABASE_URL must point at the hosted Turso DB`), because a dev machine has no Turso URL. (`prisma migrate deploy` can't be used against a `libsql://` URL at all — see the comment atop `scripts/deploy-migrations.ts`.)
- **Collector:** runs on a schedule via [`.github/workflows/collect.yml`](.github/workflows/collect.yml).
- **Frontend:** deployed on Vercel from this repo.

## License

MIT — see [`LICENSE`](LICENSE).
