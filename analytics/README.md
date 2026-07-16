# Analytics jobs (Phase 4)

Heavy statistics run here in Python (lifelines, scikit-learn) and are
**precomputed into the `AnalyticsResult` table**. The Next.js frontend only
reads the results — nothing statistical runs in the browser or a request.

## Jobs

| Job | Task | Output (`AnalyticsResult.kind`) |
| --- | --- | --- |
| `survival.py` | #21 | `survival_km` — Kaplan-Meier genre lifespan (dead-rule, censored, left-truncated) |
| `momentum.py` | #22 | `trend_momentum` — growth rate, moving average, curve slope per game/genre |
| `clustering.py` | #23 | `trajectory_cluster` — k-means player-curve archetypes |
| `opportunity.py` | #24 | `opportunity_score` — composite demand-vs-supply score per genre |
| `anomaly.py` | #25 | `change_point` — spikes/drops on game + genre curves (robust z-score) |
| `correlation.py` | #26 | `correlation` — Spearman + RandomForest importance vs player count |
| `cohort.py` | #27 | `cohort` — games grouped by launch quarter, per genre + global |
| `seasonality.py` | #28 | `seasonality` — day-of-week / hour indices on genre popularity |
| `forecast.py` | #29 | `forecast` — Holt exponential-smoothing projection + uncertainty band |

Each job replaces its own rows (delete-by-`kind` then insert), so re-running is
idempotent.

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

## Cold start

Survival, momentum, and clustering need weeks/months of accumulated snapshots to
be meaningful; until then they return `status: "insufficient…"` (correct, not a
failure). The opportunity score works immediately (it reads current aggregates).

Cloud scheduling is **Task #33** — `.github/workflows/analytics.yml` runs these
after every successful collect run, so results always reflect the newest
snapshots.
