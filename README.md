# rodict

A website for Roblox developers to spot game genres and trends worth building
next — concurrent players, genre popularity, earnings estimates, and how long
a genre tends to last before dying off. It shows statistics; it never tells
you what to build.

Reference sites: [romonitorstats.com](https://romonitorstats.com/), [rolimons.com/games](https://www.rolimons.com/games).

## Stack

- **Next.js** (App Router, Turbopack) + TypeScript + Tailwind + shadcn/ui (Base UI primitives)
- **Prisma** (engine-less, driver adapters) — SQLite locally, [Turso](https://turso.tech/) (libSQL) hosted
- **Recharts** for charts
- A **Node collector** (`scripts/collect.ts`) that pulls game data from Roblox's public APIs on a schedule
- A **Python analytics package** (`analytics/`) — lifelines, scikit-learn, pandas — that precomputes survival curves, momentum, clustering, opportunity scores, anomalies, correlation/feature importance, cohorts, seasonality, and short-term forecasts into an `AnalyticsResult` table. The frontend only reads these; nothing statistical runs per-request.

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

## Scripts

| Script                 | What it does                                                |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Start the dev server                                          |
| `npm run build`        | Production build                                              |
| `npm run lint`         | ESLint                                                         |
| `npm run collect`      | Run the data collector once (`-- --max=N`, `--known-only`)     |
| `npm run analytics`    | Run all 9 Python analytics jobs                                |
| `npm run db:migrate`   | Create/apply a local migration                                 |
| `npm run db:deploy`    | Apply pending migrations to the hosted Turso DB                |
| `npm run db:seed`      | Seed the genre/theme taxonomy                                   |
| `npm run db:backup`    | Back up the local SQLite file                                   |
| `npm run db:retention` | Downsample/prune old snapshots                                  |

## Deployment

- **DB:** hosted on Turso; `DATABASE_URL`/`DATABASE_AUTH_TOKEN` are set as environment secrets, never committed. `npm run db:deploy` applies migrations there (`prisma migrate deploy` can't be used against a `libsql://` URL — see the comment at the top of `scripts/deploy-migrations.ts`).
- **Collector:** runs on a schedule via [`.github/workflows/collect.yml`](.github/workflows/collect.yml).
- **Frontend:** deployed on Vercel from this repo.

## License

MIT — see [`LICENSE`](LICENSE).
