# Analytics jobs (Phase 4)

Heavy statistics run here in Python (lifelines, scikit-learn) and are
**precomputed into the `AnalyticsResult` table**. The Next.js frontend only
reads the results — nothing statistical runs in the browser or a request.

## Jobs

| Job | Task | Output (`AnalyticsResult.kind`) |
| --- | --- | --- |
| `survival.py` | #21 | `survival_km` — Kaplan-Meier genre lifespan (dead-rule, censored, left-truncated) |
| `momentum.py` | #22 | `trend_momentum` — per-genre 7-day growth + top movers |
| `clustering.py` | #23 | `trajectory_cluster` — k-means player-curve archetypes |
| `opportunity.py` | #24 | `opportunity_score` — composite demand-vs-supply score per genre |
| `anomaly.py` | #25 | `change_point` — spikes/drops on game + genre curves (robust z-score) |
| `correlation.py` | #26 | `correlation` — Spearman + RandomForest importance vs player count |
| `cohort.py` | #27 | `cohort` — games grouped by launch quarter, per genre + global |
| `seasonality.py` | #28 | `seasonality` — day-of-week / hour indices on genre popularity |
| `forecast.py` | #29 | `forecast` — Holt exponential-smoothing projection + uncertainty band |
| `update_impact.py` | #63 | `update_impact` — per-genre players 24h/72h after vs. before a recorded update (median, quartiles, share up) |
| `launch_benchmark.py` | #83 | `launch_benchmark` — per-genre p5…p95 of daily average players at each day 0–90 since launch, from games tracked since near launch |

`run.py` loads the data **once** (`db.load_all`) and hands it to every job as
`run(con, data)`; no job reads the snapshot tables itself (Task #44). Each job
then syncs its own rows with `db.write_results`, which **writes only what
changed**: unchanged results are skipped, changed ones updated in place, vanished
scopes deleted (Task #43). Re-running is idempotent, and an unchanged re-run
writes nothing. That matters because every insert, update and delete counts
against Turso's monthly write cap. Only store rows that a page reads.

`run.py` records per-job counts (`inserted/updated/deleted/unchanged`), per-table
`writes` and `rowsLoaded` in the `JobRun` summary. `npm run db:write-budget`
sums them into a month-to-date report (Task #42).

## Setup

```
python -m venv analytics/.venv
analytics/.venv/Scripts/python -m pip install -r analytics/requirements.txt   # Windows
# (analytics/.venv/bin/python on macOS/Linux)
```

## Run

```
npm run analytics          # runs all jobs against DATABASE_URL (defaults to file:./dev.db)
```

or a single job: `analytics/.venv/Scripts/python analytics/survival.py`.

`run.py` exits non-zero if any job fails (so CI reports it) and records the run
— success, partial, or failure — to the `JobRun` table, which drives the
freshness indicator in the site footer.

## Targets

`db.py` picks its driver from `DATABASE_URL`, so the same jobs serve both:

| `DATABASE_URL`  | Driver          | Needs                 |
| --------------- | --------------- | --------------------- |
| `file:./dev.db` | stdlib sqlite3  | —                     |
| `libsql://...`  | `libsql`        | `DATABASE_AUTH_TOKEN` |

## Tests

```
npm run test:py            # pytest, from analytics/tests/
```

Covers the pure statistical helpers (Task #37) — no DB, no network:

| Test | Covers |
| --- | --- |
| `test_deadrule.py` | the locked "dead" rule: threshold, 7-day span, recovery resets |
| `test_anomaly.py` | robust z-score + materiality bar; false-positive regressions |
| `test_momentum.py` | window growth and its `None` guards |
| `test_write_results.py` | the diff-based writer: skip unchanged, update, delete vanished, dedupe |
| `test_opportunity.py` | min-max normalization, weight signs, per-genre growth |
| `test_survival.py` | censoring + left truncation of lifetime rows |
| `test_seasonality.py` | weekday indices and the cold-start guard |
| `test_launch_benchmark.py` | near-launch filter (survivorship bias), per-day averaging, min games per day, stored percentiles |

The `_anomalies` tests pin a **real bug they caught**: with only a z-score, a
step just had to be unusual *for its series* — so on a very regular curve (tiny
MAD) an ordinary 2% wiggle scored z=36 and was published as a "notable change".
Against the collected data, 11 of 15 flags were noise (a −3.4% drop, a +7.9%
move at z=149). Anomalies now also have to clear `MIN_ABS_CHANGE`.

## Cold start

Survival, momentum, and clustering need weeks/months of accumulated snapshots to
be meaningful; until then they return `status: "insufficient…"` (correct, not a
failure). The opportunity score works immediately (it reads current aggregates).

Cloud scheduling: `.github/workflows/analytics.yml` runs these twice a day
(00:50 and 12:50 UTC, between collect runs) plus on manual dispatch. It used to
run after every collect (8×/day), which bought no useful freshness for
history-hungry analyses and multiplied reads and writes (Task #45).
