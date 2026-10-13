# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Roblox developers — solo devs and small studios — researching genres, themes and trends before they commit to building a game. They arrive with a question ("is Tower Defense crowded?", "what is rising this week?", "how did this game's launch go?") and leave with numbers to reason from. Everyone else (analysts, curious players) is secondary and not designed for.

## Product Purpose

rodict shows statistics about Roblox games, genres and themes so developers can spot patterns themselves. It records its own history, because Roblox's public APIs only return the present, and turns it into trends, survival curves, saturation, launch benchmarks and estimated earnings. Success is a developer trusting a number enough to act on it, and knowing exactly how far to trust it.

## Positioning

- **Descriptive, not prescriptive.** rodict never tells anyone what to build. A high opportunity score is not a recommendation.
- **Honest about its own uncertainty.** Estimates are labelled "Est." and shown as wide ranges; forecasts carry bands; thin data says so instead of showing a confident number; stale or failed collection is disclosed.
- **Follows games until they die.** Failed games stay in the dataset, so lifespan and survival statistics avoid survivorship bias.
- **The method is published.** Every assumption on the About page is imported from the same constants the app computes with.

## Operating Context

- An unofficial personal project, not affiliated with Roblox Corporation. Data comes only from Roblox's public web APIs.
- A collector runs every few hours; heavy statistics are precomputed twice a day by Python jobs. Pages show a snapshot, not a live feed.
- The dataset is a sample of discovered games, not all of Roblox.
- Runs on free hosting tiers with hard monthly database read and write limits. History has a gap from 20 August to 29 September 2026.

## Capabilities and Constraints

Routes today (all may be regrouped, merged, renamed or re-addressed in the rework; data and features stay):

- Overview: dashboard (`/`), market overview (`/market`), weekly recap (`/weekly`)
- Catalogue: games (`/games`, `/games/[universeId]`), genres (`/genres`, `/genres/[slug]`), themes (`/themes`, `/themes/[slug]`), creators (`/creators`, `/creators/[id]`)
- Movement: trending, new releases, updates, records, graveyard
- Analysis: saturation, niche finder (`/opportunities`), compare
- Personal: watchlist (stored in the browser; nothing is kept about the visitor)
- Reference: about the data, API and feeds docs, status
- Outputs: CSV/JSON exports, Atom feeds, embeddable SVG badge, generated share images

Constraints:

- Next.js 16 (breaking changes vs. older versions; read `node_modules/next/dist/docs/` before coding), React 19, Tailwind 4, Base UI / shadcn components, Recharts.
- Pages are cached static shells with minimal client code. A redesign must not add per-request database reads; rows read are a billed, capped resource.
- Light and dark themes both ship.
- Twenty genres each carry their own hue; a genre colour always travels with its name because twenty hues cannot be told apart by colour alone.
- Timestamps are stored in UTC and shown in the visitor's local time.

Terminology that is fixed: players / CCU, visits, genre (gameplay) vs. theme (setting), dead / active, hit, Est. earnings, opportunity score, saturation, concentration.

## Brand Commitments

- The name is **rodict**, lowercase.
- Keep the blue as the main colour as far as possible: the interface accent (`--primary`) and the navy tint of the dark theme.
- The red logo mark and the two-tone wordmark are not fixed and may be redrawn or recoloured.
- Voice: plain, exact, and upfront about limits. No hype, no advice.

## Evidence on Hand

- Real tracked data for games, genres, themes and creators, with sparklines and game icons from Roblox thumbnails.
- The full method and every assumption: `src/app/about/page.tsx`, `src/lib/glossary.ts`.
- Current logo: `public/rodictLogo.svg`.
- No testimonials, user counts, press or customer logos exist. Do not invent any.

## Product Principles

1. Show the number and how far to trust it, together.
2. Describe; never recommend.
3. Say when data is thin, missing or stale rather than filling the gap.
4. A developer should reach an answer in one or two steps from any page.
5. Speed and low database cost are features; design within them.
