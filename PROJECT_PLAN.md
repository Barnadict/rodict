# rodict — Project Plan

## ▶️ SESSION START — paste this at the beginning of every new session

```
Read PROJECT_PLAN.md, PRODUCT.md and DESIGN.md. Tasks #1–#125 are done; Phase 11 (UI rework) awaits the owner's review on `ui-rework`.
Work on the `ui-rework` branch. Nothing is pushed to main before 2026-11-01.
The Turso free plan's monthly WRITE limit is a hard constraint on every task (see "Rules").
Ask me which task to start. Remind me before any task that needs something only I can provide.
```

**One-time (first session after the folder was renamed to `rodict`):** also say _"restore the memory notes from docs/claude-memory"_.

---

## What this is

**rodict** is a website Roblox developers use to spot genres and trends worth building next. It shows statistics and never tells anyone what to build: genre popularity, concurrent players, estimated earnings, how long a genre lasts before dying off, all sortable by date.

- **References:** [romonitorstats.com](https://romonitorstats.com/), [rolimons.com/games](https://www.rolimons.com/games). **UI style:** being replaced in Phase 11 (was modelled on [devforum.roblox.com](https://devforum.roblox.com/)); dark and light mode both stay. Product facts for design work are in `PRODUCT.md`, the visual system in `DESIGN.md`.
- **Stack:** Next.js 16 + TypeScript · Tailwind v4 + shadcn/ui (Base UI) · Prisma 7 with libSQL (SQLite locally, Turso hosted) · Recharts · Node collector + Python analytics on GitHub Actions · Vercel.
- **Live:** `rodict.vercel.app` (no custom domain). Pipeline health is on `/status`.

## Current state (2026-10-01)

- The site is live, and every route is partially prerendered with cached data (`cacheLife("hours")`).
- **Collection:** GitHub Actions runs every 3h (`--charts-only --pace`), plus a weekly keyword-search discovery from your PC (Sundays 10:00, first run 2026-10-04). Busy games (≥50 CCU or first seen in the last 7 days) are collected every run, and the rest about once a day. Analytics runs twice a day.
- **Write budget:** measured at ≤~2.8M of 10M rows/month. The guard slows collection at 85%, pauses it at 95%, and paces it evenly across the month. It checks against Turso's own counter.
- **Data gap:** nothing was collected from **2026-08-20 to 2026-09-29**, after the write cap was hit. The gap is permanent. Charts must show it as missing, not as zero.
- **Storage:** 402 MB of 5 GB (2026-09-29). Retention/pruning stays off, because deletes cost writes.
- **Backups:** weekly (Sundays 04:20 UTC) to releases in a private repo.

### Open follow-ups

- Close GitHub issues #1 and #2 if they're still open (their causes were fixed in #49/#74).
- After 2026-10-04, check `logs/discovery.log` for the first weekly discovery run.
- The keepalive workflow (#51) is unproven until 60 quiet days pass.
- Check the build time and Runtime Cache usage (Vercel → Observability) after a few days of #95–#101 being live.
- **Analytics reads grow with snapshots.** `analytics/db.py` `load_game_snapshots` reads the whole `GameSnapshot` table on every run: ~1.2M rows (2026-10-01), ×2 runs/day ≈ 73M of the 500M rows-read/month, and it grows with every collect. Before it gets heavy, load only the window each job needs, or read incrementally / from a daily rollup.
- `db:retention` must not run in production until the last-of-day bucket is replaced by a write-once daily stat (`GameDailyStat`), as noted in `src/lib/retention/policy.ts`.

---

## Rules (apply to every task)

1. **Write budget.** Every task states its cost: `Writes: none`, `reduces`, or `adds ~N rows/run (Est.)`. Anything that adds writes must fit the measured budget or cut writes elsewhere. Only write what a page reads, and skip rewriting results that haven't changed. Prefer recording events (a change, once) to adding columns (a copy on every snapshot). Deletes count as writes. Check turso.tech for current plan limits instead of trusting remembered numbers.
2. **Performance.** No feature may slow down page loads or queries. Index lookup columns, aggregate in SQL, precompute heavy stats in Python, cache results, keep bundles lean. Check before calling a task done.
3. **Estimates are labeled.** Earnings, session length, forecasts and any other derived value carry an "Est." or "Projection" label and are explained on `/about`. Nothing derived is shown as official Roblox data.
4. **Descriptive, not prescriptive.** Show patterns ("players are 2× average") and let the developer decide. Never say "launch on Friday".
5. **Prerequisites.** Claude can't create accounts, enter payment details or use dashboards. When a task needs one of those, Claude stops and reminds you first.
6. **Read the Next.js docs.** This Next.js version has breaking changes, so read `node_modules/next/dist/docs/` before writing Next code.
7. **Keep this plan tidy.** When a task is done, tick it, cut its entry down to one line, and add a one-line progress log note. Detail belongs in the code, README and commit messages.

## Definitions and locked decisions

- **Collection scope:** track top games **and** discover new ones near launch, then keep following them as they decline. This prevents survivorship bias in lifespan stats.
- **Dead:** concurrent players below ~5% of the game's all-time peak for 7+ consecutive days. All-time peak is stored on `Game`, so downsampling can't break the rule.
- **Genre:** our own normalized gameplay genre, mapped from Roblox tags (manual override → name keywords → Roblox tag → none). Never Roblox's deprecated thematic `Genre` enum.
- **Theme:** a cross-cutting tag (Anime, Fantasy, Sci-Fi…) tracked separately from genre.
- **Est. earnings:** a range from public signals × tunable assumptions, converted at the DevEx rate constant. Game pass prices place a game inside the band, never beyond it.
- **Time:** stored in UTC, shown in the visitor's local time.

## Architecture

| Piece     | Where                                                                      | Role                                                              |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Frontend  | Vercel (free)                                                              | Serves the site. Only reads the DB.                               |
| Database  | Turso, free plan (`aws-ap-northeast-1`)                                    | Snapshots, events, precomputed analytics, `JobRun` history.       |
| Collector | GitHub Actions `collect.yml`, every 3h                                     | Polls Roblox and writes snapshots. Budget-guarded.                |
| Analytics | GitHub Actions `analytics.yml`, 2×/day                                     | Python jobs (survival, forecasts, anomalies…) → `AnalyticsResult` |
| Other     | `gamepasses`, `backup`, `keepalive` workflows; weekly discovery on your PC | Pass prices, backups, keeping crons enabled, keyword search.      |

Failed, cancelled or broken-partial runs open (or comment on) a GitHub issue through `alert-on-failure.yml`.

## Risks

- **Write cap.** This is the limit that actually binds (it stopped collection in Aug 2026). The guard and pacing are the defense, and `/status` shows where the month stands.
- **Roblox blocking cloud IPs.** Omni-search already returns 429 from Actions, which is why keyword discovery runs from your PC. The explore charts still work from Actions.
- **Lost history can't be re-fetched.** Weekly off-site backups cover this.
- **ToS.** Respect rate limits, credit Roblox as the source, and keep the site informational.

## Things to remember (lessons from earlier tasks)

- **Cache on a key, never a `Date`.** Loaders take a `RangeKey` and work out the cutoff inside. A `now`-based argument makes a new cache key on every request, so the cache never hits.
- **Turso rejects deep expressions** ("Expression tree is too large"). Don't build `OR:`/`AND:` from `.map()`. An ESLint rule enforces this (#77).
- **Migrations:** `npm run db:migrate` is local only. Turso gets migrations only through the "Deploy migrations" workflow (`npm run db:deploy`).
- **Never `prisma.<model>.aggregate({ _min/_max })` on a big table.** Prisma wraps it in a subquery, so SQLite skips the index and scans everything (1.2M rows per call on `GameSnapshot`). Use `findFirst` ordered by the column (`getSnapshotTimeBound`). This, plus per-instance `use cache` on game pages, burned ~1.2B rows read on 2026-09-30. Shared loaders with few keys use `use cache: remote`.
- **Page through Turso by rowid, never OFFSET.** OFFSET re-reads every earlier row, and each one counts as a read.
- **Roblox `/v1/games` accepts fewer than 100 ids per request.** Test with realistic batch sizes, not `--max=10`.
- **Turbopack JSX whitespace:** text after `{expr}` loses its leading space when it wraps onto the next line. Keep the value and its unit in one expression.
- **Vercel settings:** Framework Preset must be "Next.js", with no Output Directory override. Otherwise it deploys a static site.
- **Workflow names containing `#` get cut off.** Quote them.
- Not-found pages return HTTP 200 because they stream. That's harmless, because Next adds `noindex`.

---

## Task list

Legend: `[ ]` todo · `[x]` done. Model hint: 🟢 Sonnet is fine · 🟡 borderline · 🔴 use Opus.

### Done: Phases 0–9 (#1–#94)

Full notes for each task are in git history (this file before 2026-10-01) and in the commit messages.

- **Phase 0, foundation (#1–#3):** Next.js scaffold, git and GitHub · shadcn/ui devforum-style layout · dark/light theme.
- **Phase 1, data layer (#4–#12):** Prisma schema · genre taxonomy · Roblox API client · validation · collector · earnings model · data-access layer · retention and backup · ~~#12 local cron~~ (closed, replaced by Actions).
- **Phase 2, core pages (#13–#16):** `/games` · game detail · `/genres` · genre detail with lifecycle chart.
- **Phase 3, trends (#17–#20):** `/trending` · `/saturation` · global date range · dashboard.
- **Phase 4, analytics (#21–#29):** survival (Kaplan-Meier) · momentum · trajectory clustering · opportunity score · anomalies · correlation · cohorts · seasonality · forecasting.
- **Phase 5, deployment (#30–#34):** Turso · Vercel · collect and analytics workflows · failure alerts and freshness footer.
- **Phase 6, polish (#35–#41):** watchlist · loading, empty and error states, a11y · tests · `/about` · performance pass (Cache Components/PPR) · README · corpus scaled to ~5.3K games.
- **Phase 7, write budget and features (#42–#73):** measured budget · diff-based analytics writes · tiered cadence · budget guard · no-prune decision · timeout alerts · off-site backup · keepalive · genre snapshots from one time slice · reworked trending · local times · anomaly tuning · survival, forecast and seasonality charts · game page upgrades · update impact (`GameUpdate`) · `/themes` · `/compare` · `/new` · creator pages · Atom watchlist feed · game-pass earnings · filters · CSV/JSON export · SEO and share images · `/status`.
- **Phase 8, pipeline reliability (#74–#78):** collector fix confirmed · alerts on broken partial runs · anomaly thresholds from production · Turso-depth lint rule · plan tidy-up.
- **Phase 9, budget and new stats (#79–#94):** monthly pacing · analytics guard · guard checks Turso's real counter · weekly discovery from your PC · Est. session length and engagement · launch benchmarks · `/records` · `/graveyard` · `/creators` · market concentration · `/updates` · pass pricing · rank history · server size · `/weekly` + RSS · embeddable badge.

### Phase 10: Page speed, UI polish & new features (planned 2026-10-01)

**None of these tasks add database writes.** Several of them reduce reads. Do 10a first, because it's why pages are sometimes slow. Suggested order: #101 (baseline), #95, #96, #97, #98, then the rest.

#### 10a — Page speed (do first)

- [x] **95.** Functions pinned to Tokyo (`hnd1`, next to Turso) in `vercel.json`. Before: `x-vercel-id` showed `iad1`.
- [x] **96.** Top 200 games (by current players), every genre and every theme prerendered at deploy (`generateStaticParams`).
- [x] **97.** Game and genre pages split into a params-only header (prerendered) plus `<Suspense>` sections; only the range-dependent chart, rank history and top games wait on the query string. `/` is already a full static shell, so it was left as is.
- [x] **98.** `"use cache: remote"` (Vercel Runtime Cache, included in Hobby usage) on home, genres list, trending, records, weekly and status loaders.
- [x] **99.** `/weekly` already used a cached loader; `/weekly`, `/about` and `/watchlist` all build as static shells. No change needed.
- [x] **100.** Roblox icon sizes per use (`ICON_SIZE`: 128 for lists and headers, 256 for the grid, 512 for share images). Popular games' icons come from one shared batched call.
- [x] **101.** Speed Insights is paid, so `npm run speed` measures the live site from one machine instead (TTFB, last byte, region, cache). Baseline (SEA, 2026-10-01, `iad1`): game page 2.8–4.2 s to last byte, genre page 11–17.6 s cold / 6.7–11 s warm, trending 1.2–2.4 s. Shell TTFB ≤0.7 s. After (2026-10-01, `hnd1`): genre pages 0.4–1.3 s, game page 1.9–2.9 s (6.7 s on the first hit after deploy), trending 1.3–1.8 s, records/weekly ≤1.9 s.

#### 10b — UI & visual polish

- [x] **102.** 7-day sparklines (inline SVG `Sparkline`) in the games table, trending and watchlist, plus the dashboard. One grouped daily-average query per page for the visible rows (`db/sparklines.ts`), inside each cached loader.
- [x] **103.** Small game icons (`GameIcon`, `ICON_SIZE.small`) in trending, records, graveyard, creators (most-played game), new, weekly, watchlist and the games table. Per-request lists use the cached `getListIcons`.
- [x] **104.** Below `sm`, list tables render as stacked cards (`MobileCards`); table headers stick under the site header at `xl`.
- [x] **105.** Dashboard: headline "playing tracked games now" with a count-up number (`AnimatedNumber`, off under reduced motion), then happening now → rising (cards with icons and sparklines) → new on Roblox. Still a full static shell.
- [x] **106.** A color per genre (`--genre-<slug>`, light and dark steps; `genreColor`, `GenreBadge`, `GenreDot`) on chips, genre links, the genre trend line, compare genre lines and the saturation scatter. Color always travels with the name.
- [x] **107.** Page transitions with React `<ViewTransition>` (`experimental.viewTransition`): the page area fades out and rises in; off under `prefers-reduced-motion`.
- [x] **108.** `PageHeader` (breadcrumbs, title, description, actions) on every page. Game pages: Genres → Genre → Game; genre, theme and creator pages get their list as the parent.
- [x] **109.** Time charts share one crosshair (`syncId` + nearest-time `syncByTime`), shade 2026-08-20 → 09-29 as "No data collected", and show a clearer empty state (`ChartEmpty`), including for a single reading.

#### 10c — New features

- [x] **110.** Game page "Timeline" (`buildTimeline`, `lib/game-timeline.ts`): updates with 24h change, spikes/drops, days the overall rank halved or doubled (`RANK_CHANGE`), latest pass-list change. Replaces "Notable changes"; reads the cached "all" series.
- [x] **111.** `/opportunities` niche finder (`lib/niche-finder.ts`): size/crowding thirds, 7-day growth, concentration band, Est. session; ranked by the #24 score with per-row reasons. Themes scored with a TS port of the same formula among themes only. One remote-cached loader.
- [x] **112.** "?" popovers (`MetricHelp`, opens on hover or tap) on Est. earnings, Est. session, favorites per 1K, like ratio, concentration, opportunity score and launch benchmarks. Definitions live in `lib/glossary.ts`; `/about` rows open with them and use their anchors (a test checks every anchor exists).
- [x] **113.** "Share" copies `/watchlist?games=…&genres=…` (same ids and 50-per-kind cap as the feed, `lib/watchlist/share.ts`). A shared link shows that list read-only with "Save to my watchlist" (adds only what isn't there yet).
- [x] **114.** `/market`: total players per collection run, summed from `GenreSnapshot` in SQL (`lib/db/market.ts`, no GameSnapshot scan), with range presets, the outage band, weighted coverage, and a plain "tracked games with a genre, not all of Roblox" note. Linked from the dashboard hero, sidebar, sitemap and `/about` limitations.
- [x] **115.** `/api-docs`: export API (games/trending/snapshots, every param, limit and column), both Atom feeds and the badge, with copy buttons (`CopyCode`). Limits and options are imported from the code that enforces them (`EXPORT_GAME_SORTS` moved to `export-data.ts`). Linked from the footer, `/about` and the sitemap. Also: `SidebarInset` got `min-w-0`, so long code lines scroll instead of widening the page.

### Phase 11: Full UI rework (planned 2026-10-13)

**Writes: none. No new database reads either**: pages stay cached static shells, and features, data, exports, feeds and badges don't change. Built with the Impeccable skill; product facts are in `PRODUCT.md`.

Why: the site looks like a stock dashboard template, the 18 flat sidebar links make things hard to find, and pages are hard to scan (too many bordered boxes, no clear lead number).

Decided with the owner (2026-10-13): the user is Roblox developers; the name `rodict` stays; the **blue stays the main color** as far as possible; the red logo and two-tone wordmark may be redrawn; structure is open, including merging or renaming pages and changing URLs (old URLs must redirect).

Delivery: on a `ui-rework` branch, one phase at a time, with an owner review after each of 11a–11e. Typecheck, lint and tests at the end of every phase. No push to main before 2026-11-01.

#### 11a — Direction

- [x] **116.** `PRODUCT.md` written from the code and the owner's answers.
- [x] **117.** Visual direction chosen by the owner (2026-10-13): **Chart Rundown layout in the Departure Board colours**. Layout: top bar with grouped menus and search, a near-black page band, clearly darker than the navy ground, with a heavy condensed title (no large bright-blue fills; the owner found the blue band too harsh), ranked rows with large position numerals, movement arrows, last week, peak and weeks tracked. Colours: navy ground, white type, blue only for actions, the active tab and small accents, amber for thin or stale data, soft red for dead or falling, genre hues stepped light. Kept from the board: no motion or wording that suggests a live feed. Sketch: `.impeccable/mocks/decision/chosen.html` (the other dealt cards sit beside it). Wordmark stays two-tone: "ro" in the logo red, "dict" in an off-white with a slight blue tint (exact tones set in #119; keep it distinct from the soft red used for dead or falling). Open for #119: how the light theme is derived from this navy-first palette.
- [x] **118.** Local data to design against: `npm run collect` for real games, then `npm run dev:backfill` (`scripts/dev-backfill.ts`, refuses anything but a `file:` DB) invents the history before the latest real reading, then `npm run analytics`. **Local charts and trends are synthetic.** The original `dev.db` is in `backups/dev-before-ui-rework.db`.

#### 11b — Foundation and navigation

- [x] **119.** Tokens in `globals.css`: navy ground, `--rule` (heavy rule), `--link` (blue as text; `--primary` is the fill), `--up` / `--down` / `--warn`, `--brand`, `--chart-line`. **Light theme: the ground and type flip to cool paper and navy ink; the top bar and page band stay ink in both themes** (`.surface-ink`, which also switches on `dark:` styles inside it). Type: Archivo with its width axis; `font-display` (condensed, heavy, upper-case) and `font-figure` (lead numbers). Genre hues restepped (0.55 light, 0.76 dark); compare series kept as validated. Logo redrawn as a three-row rundown on the red tile (`components/logo.tsx`, `app/icon.svg`, `public/rodictLogo.svg`). The glow utilities are gone.
- [x] **120.** Shell: the sidebar is replaced by a top bar (`site-header.tsx`, `site-nav.tsx`) with grouped menus, search and the theme switch; below `lg` the menus move into a sheet. Footer carries the Reference links and the freshness line. Menu contents live in `lib/nav.ts`. `ui/sidebar.tsx` and `app-sidebar.tsx` deleted.
- [x] **121.** Shared pieces: `PageHeader` is the near-black band (must be the first child of the page's `p-6` wrapper; `PageHeaderSkeleton` for loading files), stat tiles and tables sit on rules instead of boxes, phone cards use the rank numeral, square genre marks, pill presets, and new `SectionHeading`, `Rank` / `Movement` / `MoveArrow`, `EmptyState`. Charts take `--chart-line`, `--up` and `--down`. Pages still carry their own bordered boxes until #123–#124.
- [x] **122.** (done with #120; the top bar needed the groups) Navigation regrouped: **Overview** (Home, Market, Weekly recap) · **Explore** (Games, Genres, Themes, Creators) · **What's changing** (Trending, New releases, Updates, Records, Graveyard) · **Research** (Saturation, Niche finder, Compare) · **Yours** (Watchlist) · **Reference**, moved to the footer (About the data, API and feeds, Status). Regrouping only; no URL changes here.

#### 11c — Main pages

- [x] **123.** Home is the players chart (ranked rows, genre chart, all-tracked figure beside it); game and genre pages lead with players now (`LeadFigure`) above the chart; games grid and both lists carry rank numerals; genres list shows each genre's share of players.

#### 11d — Remaining pages

- [x] **124.** Every remaining page moved onto rules: `SectionHeading`, `EmptyState`, `LeadFigure` / `LeadRow`, `ShareBar`, ranked tables, status colours on tokens, `.page-stack` page spacing. **No pages merged and no URLs changed**; merging Trending, New releases and Updates is still open for the owner to decide.

#### 11e — Finish

- [x] **125.** Checked every route at 1440px and 390px in both themes (no sideways scroll, no console errors), Impeccable detector clean, share image and badge redrawn in the new colours, `DESIGN.md` written. Not done: a production build, and the owner's own review of 11c–11e.

### Later (not planned)

- Discord webhook alerts for the watchlist (proposed 2026-10-01, postponed).
- Accounts, auth/verification, ads.
- A paid DB tier or a different host, if the write budget can't fit the collection cadence the analytics need.

---

## Progress log

One line per session or phase. Details are in git history.

- **2026-07-16:** Plan created. Phases 0–5 built: scaffold, data layer, core pages, trends, all nine analytics jobs, Turso + Vercel + Actions deployment.
- **2026-07-17:** Phase 6 done (watchlist, a11y, tests, `/about`, Cache Components/PPR, README). Corpus scaled ~343 → thousands (#41). Paused to accumulate history.
- **2026-08-20:** Collection stopped when the Turso monthly write cap was hit. Nothing collected until 2026-09-29.
- **2026-09-29 – 30:** Phase 7 (#42–#73): write budget measured and guarded, data-correctness fixes, analytics shown in the UI, many new pages. Phase 8 (#74–#78): pipeline reliability.
- **2026-09-30:** Phase 9 (#79–#94): pacing, analytics guard, Turso usage check, weekly discovery, new stats pages, `/weekly`, badge.
- **2026-10-01:** Plan cleaned up (done tasks cut to one line each; lessons moved to "Things to remember"). Phase 10 (#95–#115) planned: page speed, UI polish, new features. Discord webhooks moved to Later.
- **2026-10-01:** 10a page speed (#95–#101): Tokyo region, prerendered game/genre/theme pages, streamed detail sections, remote cache for shared loaders, right-sized icons, `npm run speed`.
- **2026-10-01:** 10b UI polish (#102–#109): sparklines, list thumbnails, phone cards and sticky headers, dashboard redesign, genre colors, page transitions, `PageHeader` with breadcrumbs, synced chart crosshairs and the outage band. Writes: none.
- **2026-10-01:** #110 game timeline and #111 niche finder (`/opportunities`). Writes: none.
- **2026-10-01:** #112 metric glossary popovers and #113 shareable watchlists. Writes: none.
- **2026-10-01:** #115 API docs page. Writes: none.
- **2026-10-01:** #114 market overview (`/market`). Phase 10 done. Writes: none.
- **2026-10-13:** Phase 11 planned (#116–#125): full UI rework with the Impeccable skill, on a `ui-rework` branch. `PRODUCT.md` written (#116). Writes: none.
- **2026-10-13:** #118 local design data: 303 real games collected into `dev.db`, synthetic history back-filled, analytics and game passes run locally. Turso untouched.
- **2026-10-13:** 11b foundation and navigation (#119–#122): tokens and Archivo, redrawn logo, top bar with grouped menus in place of the sidebar, restyled shared components. Typecheck, lint and tests pass. Writes: none.
- **2026-10-13:** 11c–11e (#123–#125): all pages reworked onto rules with one lead figure or chart each, share image and badge recoloured, `DESIGN.md` written. Home now loads 10 top games instead of 5 (5 more sparklines per cache window) and no longer loads sparklines for the top genres. Typecheck, lint and tests pass. Writes: none.
