# rodict — Roblox Game Trends & Statistics Website — Project Plan

## ▶️ SESSION START — copy/paste this at the beginning of every new session

```
Read PROJECT_PLAN.md and continue the build. Last finished task: #2.
Follow the plan's rules: optimize as you go, label all estimates/forecasts explicitly,
and remind me before any task that needs a prerequisite I must provide.
```

> **Update the task number** (`Last finished task: #N`) each session so Claude knows where to pick up. Current progress: **Task #2 done → next is Task #3**.
>
> **One-time (first session after the folder was renamed to `rodict`):** also say
> _"restore the memory notes from docs/claude-memory"_ so Claude re-creates the per-project memory at the new path.

---

**Site name:** rodict
**Reference sites:** [romonitorstats.com](https://romonitorstats.com/), [rolimons.com/games](https://www.rolimons.com/games)
**UI style:** [devforum.roblox.com](https://devforum.roblox.com/) — dark + light mode
**Recommended stack:** Next.js + TypeScript · Tailwind + shadcn/ui · Prisma (SQLite locally → Neon/Turso hosted) · Recharts · Node collector + Python analytics jobs on GitHub Actions · **hosting: Vercel**

**Goal:** A website Roblox developers use to spot game genres and trends worth building next — by showing statistics (never telling them what to do). Genre popularity, earnings estimates, concurrent players, how long a genre lasts before dying off, all sortable by date.

**Current scope:** Functional for personal use. **Later (out of scope now):** accounts, verification, ads.

---

## How to resume across sessions

1. Open a new session in this project.
2. Say: **"Read PROJECT_PLAN.md. Last finished task: #N — continue."**
3. Claude reads this file + existing code, then does task **#N+1** and checks it off here.

The plan is fully editable — reorder, rescope, swap the stack, or add/remove tasks anytime.
**One time-sensitive note:** historical trend data only accumulates from the day the collector (Task #8/#12) first runs — don't delay that part. The data-science phase (Phase 4) also depends on having weeks of accumulated snapshots.

---

## Locked decisions

These were decided up front because they shape Phase 1 data design:

- **Collection scope:** track top games **AND** discover new/rising games near launch, then keep following them as they decline. This avoids **survivorship bias** — without it, dead games never enter the dataset and every survival/lifespan stat is wrong.
- **Definition of "dead"/"died off":** a game is considered dead when its concurrent player count stays **below ~5% of the game's all-time peak for 7+ consecutive days**. Tunable, but this is the operational rule survival analysis uses.
- **Genre taxonomy:** maintain our **own normalized genre list** and map Roblox's native tags onto it, with manual overrides for mislabeled games. Genre drives every statistic, so its quality matters most.

---

## Prerequisites you (the user) must provide

Claude cannot create external accounts, verify emails, enter payment info, or click OAuth/login screens. These are on you — but **nothing here is needed to start** (Tasks #1–#29 are fully local). **Reminder protocol: when Claude reaches a task that needs one of these, it will pause and remind you before proceeding.**

Local tooling (already verified present): Node v24 ✅ · npm v11 ✅ · git 2.54 ✅ · Python 3.10 ✅. Optional: `gh` (GitHub CLI) not installed — installing it smooths GitHub setup but isn't required.

| #   | What you provide                                                            | Needed at                      | Cost      | Notes                                                                                     |
| --- | --------------------------------------------------------------------------- | ------------------------------ | --------- | ----------------------------------------------------------------------------------------- |
| 1   | **GitHub account + repo** (push access)                                     | Task #1 (init) / #32 (Actions) | Free      | Public repo = unlimited Actions minutes; private = limited. **Decide public vs private.** |
| 2   | **Vercel account** (hosting)                                                | Task #31                       | Free      | Sign up via GitHub login; authorize it.                                                   |
| 3   | **Hosted database** (Neon or Turso) → give Claude the **connection string** | Task #30                       | Free tier | The single most important credential.                                                     |
| 4   | **GitHub Actions secrets** (paste DB string + tokens into repo settings)    | Task #32                       | Free      | Claude prepares the workflow + tells you exactly what to paste; you enter the values.     |
| 5   | **Backup destination** (optional) — bucket or private repo for DB exports   | Task #11                       | Free      | Only if you want off-site backups of irreplaceable history.                               |

**Settled choices:** site name = **rodict** · hosting = **Vercel** · collection frequency = **default (hourly), tunable later** · custom domain = **skip for now** (free `*.vercel.app` URL).

**Handled by research, not required from you** (✅ confirmed): earnings-estimation assumptions (#6, now in Task #9) and the normalized genre list (#7, now in Task #5).

---

## Standing requirement: performance & optimization

**Optimize aggressively at every step — this is a rule that applies to all work, not a one-time task.** As features, data, and analytics grow, performance must be protected continuously or it degrades. Apply throughout:

- **Data/DB:** index snapshot tables on lookup columns (gameId, genre, collectedAt); paginate and aggregate in SQL, never load full tables into memory; precompute expensive analytics into result tables (never compute on request).
- **Frontend:** server-render/stream where possible, code-split, lazy-load charts, virtualize long tables, memoize, keep bundles lean, optimize images/thumbnails.
- **Caching:** cache Roblox API responses and computed query results; use incremental revalidation for pages reading mostly-static precomputed data.
- **Collector/analytics:** batch API calls, respect rate limits, only recompute what changed.
- **Guardrail:** each new feature must not regress page load or query time — verify before considering a task done.

---

## Key feasibility notes

- **Doable now:** game stats (playing count, visits, favorites, likes/dislikes, active/dead), genre stats, trends over time, sort/filter by date.
- **Trends over time** require _your own_ stored snapshots — Roblox APIs return a snapshot of _now_, not history. The collector builds that history over time.
- **Earnings = ESTIMATES.** Roblox has no public revenue API. Like Rolimons/RoMonitor, earnings are derived from indirect signals. **Every estimated or forecasted value is labeled explicitly** (inline "Est."/"Projection" badges + the "About the data" page). Nothing derived is shown as official Roblox data.
- **Roblox APIs** are rate-limited and semi-official — the plan builds in caching + a polite scheduled collector.
- **Cold start:** the site launches with near-zero history. Trend and analytics features are intentionally sparse for the first few weeks until snapshots accumulate — this is expected, not a bug.

---

## Hosting & automated collection (free-tier architecture)

Static/serverless hosts (Netlify/Vercel) **cannot** run the collector alone — ephemeral filesystem (a SQLite file won't persist) and short function timeouts. The free-tier split that works:

| Piece         | Free option                                                      | Role                                                                      |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Frontend**  | Vercel (free)                                                    | Serves the website                                                        |
| **Database**  | Neon (Postgres) or Turso (hosted SQLite) — free tier, persistent | Stores snapshots + precomputed analytics                                  |
| **Collector** | GitHub Actions scheduled workflow (cron, free minutes)           | Polls Roblox on a schedule, writes snapshots to the hosted DB             |
| **Analytics** | GitHub Actions scheduled workflow (Python)                       | Precomputes heavy stats (survival, clustering, forecasts), stores results |

**Why this works:** GitHub Actions is a free, reliable cron scheduler. Heavy math is precomputed offline in Python (strong stats libraries) and stored — the frontend only _reads_ results, so nothing heavy runs in the browser or a timed-out function. Local dev uses SQLite; because we use Prisma, moving to the hosted DB is a config change, not a rewrite.

---

## Risks & operational concerns

- **Datacenter IP blocking:** Roblox may rate-limit or block cloud IPs (GitHub Actions runners) more aggressively than home IPs. Mitigation: polite backoff, caching, low frequency; fallback to a cheap alternative runner or self-hosted runner if blocked.
- **ToS / legal:** scraping and redisplaying Roblox data has Terms-of-Service implications even for personal use. Stance: respect rate limits, attribute Roblox as the source, keep it informational/personal, and document this on the "About the data" page.
- **Free-tier DB limits:** snapshots grow forever; the retention/downsampling job (Task #11) keeps size within Neon/Turso free caps.
- **Irreplaceable history:** accumulated snapshots cannot be re-fetched — if the DB is lost, that history is gone permanently. Mitigation: periodic export/backup (Task #11).
- **Collector reliability:** unattended jobs fail silently (endpoint changes, blocks). Monitoring (Task #34) alerts on failures and surfaces "last successful collection."

---

## Definitions

- **Dead / died off:** concurrent players below ~5% of the game's all-time peak for 7+ consecutive days (used by survival analysis).
- **Active:** not dead — has meaningful concurrent players relative to its own history.
- **Genre:** our normalized _gameplay_ genre label (mapped from Roblox tags), not Roblox's deprecated thematic `Genre` enum. See Task #5 for the list.
- **Theme:** a cross-cutting tag (e.g. Anime, Fantasy, Sci-Fi) tracked separately from genre.
- **Estimated earnings:** a derived range from public signals × tunable assumptions, converted via the DevEx rate constant. Always labeled "Est." — never presented as real revenue. See Task #9.
- **All timestamps stored in UTC** — display in local time only in the UI.

---

## Task list

Legend: `[ ]` todo · `[x]` done
Model hint (right after each task number): 🟢 = Sonnet can handle it · 🟡 = borderline (Sonnet can attempt, Opus safer) · 🔴 = use Opus. These are my judgment calls; you switch models manually after each task.

### Phase 0: Foundation

- [x] **1.** Scaffold Next.js + TypeScript project; set up Tailwind, ESLint/Prettier, folder structure. Confirm dev server runs. **Initialize a git repo, add `.gitignore` + `.env.example`, and create a GitHub remote** (required later for GitHub Actions automation in Phase 5). ✅ Done — Next.js 16 + React 19 + Tailwind v4 (App Router, `src/`, `@/*` alias); Prettier wired into ESLint; `.env.example` + `.gitattributes`; local git repo initialized (2 commits). **GitHub remote deferred** — not needed until Task #32; will remind.
- [x] **2.** 🟢 Install & configure shadcn/ui. Build base layout: top nav bar, sidebar, content area, footer — laid out like devforum.roblox.com. ✅ Done — shadcn/ui initialized (`base-nova` style, Base UI primitives, neutral base color); added sidebar, sheet, tooltip, avatar, dropdown-menu, input, scroll-area, badge, skeleton components. Built `AppSidebar` (collapsible, devforum-style nav: Dashboard/Games/Genres/Trending + Watchlist/About), `SiteHeader` (sidebar trigger, search input, spot reserved for Task #3's theme toggle), `SiteFooter` (unofficial-project disclaimer + estimate-labeling link). Wired into root layout via `SidebarProvider`/`SidebarInset`/`TooltipProvider`. Fixed a lint issue in the generated `use-mobile` hook (setState-in-effect → `useSyncExternalStore`) and two Base-UI API mismatches (`TooltipProvider` uses `delay` not `delayDuration`; `SidebarMenuButton` uses the `render` prop, not `asChild`). Verified: `next build` + `tsc --noEmit` clean, dev server run and HTML fetch confirmed all nav items/header/footer render.
- [ ] **3.** 🟢 Implement dark/light mode toggle (next-themes) with persisted preference. Define a devforum-inspired color theme for both modes.

### Phase 1: Data layer

- [ ] **4.** 🔴 Set up Prisma. Design schema (DB-agnostic so SQLite-local → hosted Postgres/Turso works): Game, Genre, GameSnapshot (timestamped), GenreSnapshot, GameGenreHistory (genre can change over time), AnalyticsResult tables. Store **all timestamps in UTC**. Track each game's **all-time peak players** (needed for the "dead" rule). Index on gameId, genre, collectedAt.
- [ ] **5.** 🟡 Genre taxonomy: define our normalized genre list and a mapping layer from Roblox tags → our genres, with manual-override support for mislabeled games. **Do NOT use Roblox's official `Genre` enum — it's deprecated and thematic (TownAndCity, Fantasy, Ninja…), not gameplay-based.** Starting normalized list (gameplay genres): Simulator, Tycoon, Obby, RPG, Roleplay & Life, Tower Defense, Fighting/Combat, Shooter/FPS, Horror, Adventure, Survival, Sports, Racing, Clicker/Idle, Strategy, Minigame/Party, Sandbox/Building, Escape/Story, Puzzle, Social/Hangout. Keep **theme tags separate from genre** (e.g. "Anime Fighting Simulator" → genre=Simulator, theme=Anime). List is extensible.
- [ ] **6.** 🟡 Build a Roblox API client module (games list, game details, thumbnails, votes/favorites) with rate-limit handling, retries, response caching.
- [ ] **7.** 🟢 Data validation & sanitization layer — validate/clean Roblox responses before writing (reject nulls/garbage, dedupe) so bad rows never poison analytics.
- [ ] **8.** 🔴 Build the data collector. **Scope:** fetch top games AND discover new/rising games near launch, then keep following them as they decline (avoids survivorship bias). Normalize, map genres, write a timestamped snapshot. Run once manually; verify rows land.
- [ ] **9.** 🔴 Implement earnings ESTIMATION model (documented, clearly labeled). **Approach:** Roblox publishes no per-game revenue and gamepass sale counts have been private since July 2020 — so estimate from public signals we can actually collect (concurrent players, visits, visit-growth) × a **configurable revenue-per-metric assumption**, converted Robux→USD via a **DevEx rate stored as a config constant**. Always display as a **labeled range ("Est.")**, never a hard figure. Store the DevEx rate in one place so it's a one-line update when Roblox changes it. DevEx reference: $0.0035 legacy (pre 2025-09-05), $0.0038 standard (from 2025-09-05), $0.0054 US-18+ in-experience (from 2026-06-08). Add a derived-metrics function. Backfill on stored snapshots.
- [ ] **10.** 🟡 Build a data-access layer (typed query/repository module) so all pages and analytics read the DB consistently and efficiently — single place to optimize queries.
- [ ] **11.** 🟡 Retention & downsampling job. Default policy: keep hourly for 7 days → daily for 90 days → weekly forever (tunable). Keeps the free-tier DB within size limits. **Also add a periodic DB export/backup** (e.g. dump to a file/cloud storage) — accumulated history is irreplaceable and can't be re-fetched.
- [ ] **12.** 🟢 Set up scheduled collection locally (cron / node-cron) so history accumulates during development. (Cloud automation lands in Phase 5.)

### Phase 2: Core pages (read from DB, not live API)

- [ ] **13.** 🟢 Games list page: sortable/filterable table (players, visits, favorites, est. earnings, genre) — the rolimons/games equivalent. Search + pagination.
- [ ] **14.** 🟢 Game detail page: header stats + historical player-count chart (Recharts) with date-range selector.
- [ ] **15.** 🟢 Genre statistics page: most played, highest est. earnings, biggest concurrent players, most games — sortable, with date filtering.
- [ ] **16.** 🟡 Genre detail page: player trend over time + "lifecycle" chart (avg game player curve from launch to decline).

### Phase 3: Trends & insights (descriptive)

- [ ] **17.** 🟡 Rising/Trending board: fastest-growing games & genres over 7/30 days (growth rate + moving average).
- [ ] **18.** 🟡 Basic genre saturation view (games vs. players → crowded vs. under-served). Advanced scoring comes in Phase 4.
- [ ] **19.** 🟢 Global date-range control wired across all stats pages (sort by date).
- [ ] **20.** 🟢 Dashboard/home page summarizing top insights (trending, top genres, movers).

### Phase 4: Analytics & data science (precomputed in Python jobs; needs accumulated data)

> Each result is stored in the DB and shown read-only. Estimates/projections are labeled explicitly.

- [ ] **21.** 🔴 **Survival analysis (Kaplan-Meier / hazard rates)** — genre lifespan using the "dead" rule (<5% of peak for 7+ days): "median lifespan of a {genre} game is X weeks," handling still-alive (censored) games correctly. Directly answers the core goal.
- [ ] **22.** 🔴 **Trend & momentum metrics** — formalize growth rate, moving averages, and slope of player curves; feeds a robust Rising board and separates real climbs from noise.
- [ ] **23.** 🔴 **Trajectory clustering (k-means / DTW on player curves)** — group games by shape: fast-spike-fast-fade vs. slow-burn-long-tail; surface which pattern a genre tends toward.
- [ ] **24.** 🔴 **Opportunity / saturation score** — composite demand-vs-supply index per genre to rank under-served niches (the most decision-relevant feature). Upgrades Task #18.
- [ ] **25.** 🔴 **Change-point / anomaly detection** — auto-flag player spikes/drops (updates, viral moments) on game and genre curves.
- [ ] **26.** 🔴 **Correlation & feature importance (regression / tree-based)** — "which stats associate with sustained players or higher est. earnings?" Shown as descriptive/associational, NOT causal.
- [ ] **27.** 🔴 **Cohort analysis** — group games by launch window; compare retention/decline across genres over time.
- [ ] **28.** 🔴 **Seasonality detection** — day-of-week / holiday effects on genre popularity.
- [ ] **29.** 🔴 **Forecasting (Prophet / exponential smoothing)** — near-term genre trajectory projections. Shown as projections WITH uncertainty bands, explicitly labeled — never presented as certain.

### Phase 5: Deployment & cloud automation (free tier)

- [ ] **30.** 🟢 Provision hosted DB (Neon Postgres or Turso); point Prisma at it via env vars. Keep SQLite for local dev.
- [ ] **31.** 🟢 Deploy frontend to Vercel/Netlify; configure env/secrets.
- [ ] **32.** 🟢 Set up GitHub Actions scheduled workflow to run the collector on a cron against the hosted DB.
- [ ] **33.** 🟡 Set up a second GitHub Actions (Python) workflow to run the Phase 4 analytics on a schedule and write results to the DB.
- [ ] **34.** 🟡 Collector/analytics failure monitoring — alert on failed runs, log run history, and surface a "last successful collection" indicator in the UI.

### Phase 6: Polish & quality

- [ ] **35.** 🟢 Local watchlist (localStorage, no account) for games/genres.
- [ ] **36.** 🟢 Loading states, empty states, error handling, mobile responsiveness, and a basic accessibility (a11y) pass.
- [ ] **37.** 🟡 Testing — cover the earnings-estimation model, the analytics functions (correctness), and the data-validation layer.
- [ ] **38.** 🟢 "About the data" page — data sources, collection method, definitions, and explicit explanation that earnings/forecasts are estimates.
- [ ] **39.** 🟡 Performance optimization pass — audit with Lighthouse/bundle analyzer, profile slow DB queries, verify indexes, tighten caching and code-splitting. (Reinforces the standing rule; does not replace optimizing along the way.)
- [ ] **40.** 🟢 Final review: caching, cleanup, and write README with run steps.

### Later (out of scope for now)

- Accounts, auth/verification, ads.
- **Update/relaunch impact** — correlate player spikes with detected game updates (builds on Task #25).

---

## Data-science notes

- **All Phase 4 methods need accumulated history** — results are thin until the collector has gathered weeks/months of snapshots. Start collection (Task #8/#12) early.
- **Estimates stay estimates** — earnings-derived and forecasted results inherit uncertainty and are labeled as such everywhere they appear.
- **Descriptive, not prescriptive** — everything shows patterns and lets the developer decide; the site never tells them what to build.
- **Compute split** — heavy stats run offline in Python (scikit-learn, lifelines, Prophet/statsmodels) as scheduled jobs and are precomputed into the DB; the frontend only displays results.

---

## Progress log

_(Claude appends a one-line note here each time a task is completed.)_

- _Plan created 2026-07-16._
- _2026-07-16: Expanded plan — added full analytics phase (survival analysis, clustering, opportunity scoring, anomaly/change-point, correlation, cohort, seasonality, forecasting), a free-tier hosting + GitHub Actions automation phase, and explicit estimate-labeling requirements._
- _2026-07-16: Added performance & optimization as a standing cross-cutting requirement plus a dedicated optimization pass._
- _2026-07-16: Locked 3 design decisions (collection scope = top + follow new; "dead" = <5% of peak for 7+ days; genre = normalized mapping). Added data validation, data-access layer, retention/downsampling, collector monitoring, testing, UTC storage, a Risks section, a Definitions section, and a cold-start note. Plan now 40 tasks across 7 phases._
- _2026-07-16: Final review — folded in git/GitHub setup (Task #1), DB export/backup for irreplaceable history (Task #11 + Risks), and .env.example/accessibility notes. Task count unchanged (folded into existing tasks, no renumbering)._
- _2026-07-16: Added "Prerequisites you must provide" section with a reminder protocol; locked site name = rodict, hosting = Vercel, collection frequency = default hourly, custom domain skipped. Earnings assumptions (#6) + genre list (#7) researched via web — pending user confirmation before adding to Tasks #9/#5._
- _2026-07-16: User approved both — normalized genre list written into Task #5, earnings-estimation approach + DevEx-rate constant written into Task #9, and both reflected in Definitions._
- _2026-07-16: Added per-task model hints (🟢 Sonnet · 🟡 borderline · 🔴 Opus) after each task number, with a legend under the task-list header. Every task is explicitly marked. User switches models manually per task._
- _2026-07-16: **Task #1 complete.** Scaffolded Next.js 16 + React 19 + Tailwind v4 (App Router, src/, @/* alias) as package "rodict"; added Prettier (+ eslint-config-prettier), .env.example, .gitattributes; created src/components & src/lib; production build verified clean; git repo initialized with 2 commits. GitHub remote intentionally deferred to Task #32. **Next: Task #2** (shadcn/ui + devforum-style base layout)._
- _2026-07-16: **Task #2 complete.** shadcn/ui installed (base-nova style, Base UI primitives). Built devforum-style base layout: collapsible left sidebar (Dashboard/Games/Genres/Trending/Watchlist/About), top header (sidebar toggle + search), footer (unofficial-project + estimates disclaimer). Root layout wired with SidebarProvider/TooltipProvider. Fixed a generated-hook lint error and two Radix→Base-UI API differences encountered along the way. Verified via clean `next build`/`tsc --noEmit` and a live dev-server HTML check. **Next: Task #3** (dark/light mode toggle)._
