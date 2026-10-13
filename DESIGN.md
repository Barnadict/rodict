---
name: rodict
description: Roblox game, genre and trend statistics, set as a chart rundown in departure-board colours.
colors:
  ground: "#0a1730"
  ink: "#f5f8ff"
  muted-ink: "#8ea0c8"
  bar: "#06102a"
  band: "#060f25"
  paper-band: "#e3eaf8"
  card: "#0e1e3f"
  muted-surface: "#11224a"
  hairline: "#1b2c58"
  rule: "#33488a"
  primary: "#155dfc"
  link: "#8fb4ff"
  chart-line: "#6f9bff"
  up: "#62d4a0"
  down: "#e0796f"
  warn: "#ffb000"
  brand: "#f0473c"
  brand-ink: "#e3ecff"
  paper: "#f6f8fc"
  paper-ink: "#0a1730"
  paper-muted-ink: "#51607f"
  paper-hairline: "#d5dcec"
  paper-link: "#0f4fe0"
  paper-up: "#0b7a52"
  paper-down: "#c0392f"
  paper-warn: "#946000"
  paper-brand: "#d92b20"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 4.5rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 68"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 68"
  figure:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 9vw, 5rem)"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 72"
    fontFeature: "'tnum'"
  stat:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 72"
    fontFeature: "'tnum'"
  rank:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 72"
    fontFeature: "'tnum'"
  badge:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  mark: "2px"
  sm: "4px"
  md: "6px"
  pill: "9999px"
spacing:
  row: "10px"
  tile-gap: "20px"
  page: "24px"
  section: "44px"
  column-gap: "44px"
components:
  page-band:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    padding: "24px"
  top-bar:
    backgroundColor: "{colors.bar}"
    textColor: "{colors.ink}"
    height: "56px"
  section-heading:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    padding: "0 0 6px"
  lead-figure:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
  stat-tile:
    textColor: "{colors.ink}"
    padding: "10px 0 0"
  preset-pill:
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  preset-pill-active:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  table-row-hover:
    backgroundColor: "{colors.muted-surface}"
  genre-mark:
    rounded: "{rounded.mark}"
    size: "10px"
---

# Design System: rodict

## Overview

**Creative North Star: "Chart Rundown in the Departure Board colours"**

rodict reads like a printed chart rundown: a heavy condensed title on a tinted band, then ranked rows with large position numerals, a figure, a movement arrow and a small line. The colours come from a departure board: navy ground, white type, and colour used only as a signal. Blue means an action or the selected control, green means rising, soft red means falling or dead, amber means thin or stale data. Twenty genre hues exist, and each always travels beside its genre's name.

The layout is rules, not boxes. A section starts with its title over a heavy rule; tables, lists and stat tiles sit on hairlines under it. Nothing floats on a card, and nothing glows. Each page has one lead: a single large figure (`LeadFigure`) or the ranked chart itself. Every other number is a `StatTile`.

The board's honesty is kept and its motion is not: nothing ticks, flips or pulses, because pages show a snapshot and not a live feed. Estimates carry an "Est." badge wherever they appear, and a missing reading is drawn as missing.

**Key Characteristics:**

- The page title in Archivo at its condensed, heaviest end, upper-case, on a tinted band one step off the ground, over a heavy rule.
- Position numerals in the figure face; names in bold; figures right-aligned and tabular.
- Heavy rule (2px) under section titles and table heads, hairlines between rows, no boxed cards.
- One lead figure or chart per page.
- Colour is a signal: blue acts, green rises, soft red falls, amber warns.
- Both themes share the same ink top bar, the only dark surface in the light theme; the ground and type flip.

## Colors

A navy-first palette where almost everything is ink or ground, and each hue has exactly one job. All values are tokens in `src/app/globals.css`.

### Primary

- **Action Blue** (`#155dfc`, `--primary`): fills only: the selected preset pill, primary buttons, the text selection. As text it is too dark on navy, so links use **Link Blue** (`#8fb4ff` dark, `#0f4fe0` light, `--link`), and single-series chart lines and sparklines use **Chart Blue** (`#6f9bff` dark, `#155dfc` light, `--chart-line`).

### Secondary

- **Rising Green** (`#62d4a0` dark, `#0b7a52` light, `--up`): growth figures, upward arrows, positive correlation bars, a healthy status.
- **Falling Red** (`#e0796f` dark, `#c0392f` light, `--down`): declines, downward arrows, dead games, failed runs. Deliberately softer than the logo red.
- **Thin-Data Amber** (`#ffb000` dark, `#946000` light, `--warn`): the small square in an `EmptyState`, stale collection, the write-budget warning, the estimates notice on About. Never decoration.

### Tertiary

- **Logo Red** (`#f0473c` dark, `#d92b20` light, `--brand`): the logo tile and the "ro" of the wordmark, nowhere else. "dict" is **Wordmark Ink** (`#e3ecff`, `--brand-ink`).
- **Genre hues** (`--genre-*`): twenty hues 18° apart at one lightness and chroma (`oklch(0.76 0.12 h)` dark, `oklch(0.55 0.15 h)` light). Used as a 10px square beside the genre's name and as that genre's chart line.
- **Compare series** (`--series-1` to `--series-4`): four validated categorical colours for multi-line charts only.

### Neutral

- **Navy Ground** (`#0a1730`, `--background`) and **Board Ink** (`#f5f8ff`, `--foreground`): the page and its type in the dark theme. The light theme flips them to **Cool Paper** (`#f6f8fc`) and navy ink.
- **Bar** (`#030916`, `--bar`): the top bar. **Band** (`#060f25`, `--band`): the band behind the page title, a shade between the top bar and the navy ground. Both are ink surfaces (`.surface-ink`), the same in both themes, so the light theme keeps a navy bar and title band over its cool-paper ground.
- **Muted Ink** (`#8ea0c8` dark, `#51607f` light, `--muted-foreground`): labels, notes, table heads. Tinted from the navy, never grey.
- **Hairline** (`#1b2c58` dark, `#d5dcec` light, `--border`) between rows; **Rule** (`#33488a` dark, `#0a1730` light, `--rule`) under headings and table heads.
- **Muted Surface** (`#11224a` dark, `#edf1f9` light, `--muted`): row hover, bar tracks, skeletons.

### Named Rules

**The One Job Rule.** Each hue means one thing. Blue is never used for "rising", amber is never used for emphasis, and the logo red is never used for "falling".

**The Name Travels Rule.** A genre colour never appears without the genre's name beside it or in a legend. Twenty hues cannot be told apart by colour alone.

**The Tokens Only Rule.** No Tailwind palette colours (`emerald-500`, `red-500`, `amber-500`) in pages or components. Use `text-up`, `text-down`, `text-warn`, `text-link`, `bg-chart-line`.

## Typography

**Display Font:** Archivo (variable, with its width axis), falling back to system-ui
**Body Font:** Archivo at normal width
**Label/Mono Font:** Geist Mono, for code, URLs and API paths only

**Character:** One family doing every job by changing width and weight. The condensed black end is the headline voice of a printed chart; the normal width is a plain, exact text face. Every figure is tabular.

### Hierarchy

- **Display** (`font-display`: weight 900, width 68%, upper-case, line-height 0.92; `clamp(2.5rem, 6vw, 4.5rem)`, stepping down for long titles): the page title in the band. One per page.
- **Headline** (`font-display` at 1.5rem, 1.125rem for `h3`): section titles in `SectionHeading`, over the heavy rule.
- **Figure** (`font-figure`: weight 800, width 72%, case untouched): position numerals (`Rank`: 1.5rem, 2.25rem, 3.5rem), the lead figure (`clamp(2.75rem, 9vw, 5rem)`), stat tile values (1.75rem) and the key column of a ranked table.
- **Title** (weight 700, 1rem to 1.0625rem): the name in a row: a game, a genre, a creator.
- **Body** (weight 400, 0.875rem): table cells and explanatory text. Explanations are capped at 75ch.
- **Label** (weight 400, 0.8125rem, muted): table heads, stat labels, notes under a table. Sentence case, never upper-case or letter-spaced.

### Named Rules

**The Two Voices Rule.** Condensed and heavy is for titles and figures only. Anything a reader has to read as a sentence is set at normal width.

**The Column Rule.** Numbers are right-aligned and tabular so a column can be compared by eye. `font-variant-numeric: tabular-nums` is set on `body`.

## Layout

Pages are full width with a 24px gutter (`.page-stack`: a flex column, 24px gap, 24px padding). The page band is the first child and pulls out to the edges (`page-band`). A titled `<section>` gets 20px more above it, so sections sit 44px apart while a heading stays 12px from its content.

Wide pages use two columns, `minmax(0, 1fr)` and a 22rem aside, 44px apart (home). Supporting stats sit beside the lead figure in a `LeadRow` and drop under it on a phone. Stat tiles are a 2-column grid on a phone and 3 or 4 columns from `sm`, with a 20px column gap.

Tables are the default for comparison. Below `sm` a wide table is replaced by `MobileCards`: stacked rows with the rank numeral, name and two or three stats. Table heads stick under the top bar from `xl`. No page scrolls sideways at 390px; a table that cannot collapse scrolls inside its own wrapper.

The top bar is 56px, sticky, with grouped menus that move into a sheet below `lg`. Anchored sections use `scroll-mt-20` to clear it.

## Elevation & Depth

Flat. Depth is tonal: bar darkest, the band between bar and ground, hover one step lighter than ground. The only shadows are on things that really float above the page: popovers, menus, chart tooltips and the search dialog. The sticky table head repeats its rule as a 2px shadow (`0 2px 0 var(--rule)`) because collapsed borders do not travel with a sticky head.

### Named Rules

**The Rules Not Boxes Rule.** Content is separated by rules and space. Do not wrap a table, chart, list or stat in a bordered, rounded container.

## Shapes

Squared and small. The base radius is 6px (`--radius`), used for inputs, buttons, game icons and popovers. Marks are 2px: the genre square, the status square, the amber square, bar tracks. Badges are 4px. Only preset pills are fully round, which is what sets a control apart from a label.

Rules come in two weights: 1px hairlines between rows and a 2px rule under a heading, table head or above a stat tile. Arrows are a drawn triangle (`MoveArrow`), not a font glyph.

## Components

- **PageHeader** (`components/page-header.tsx`): an optional breadcrumb trail, the display title, a description beside it (below it for long titles) and actions on the right, on the tinted band over the heavy rule. Must be the first child of the page wrapper. `PageHeaderSkeleton` for loading files.
- **SectionHeading** (`components/section-heading.tsx`): display title over the heavy rule, with an `aside` on the right for a link, an export, a badge or presets. Followed by an optional lede: `max-w-[75ch] text-sm text-muted-foreground`.
- **LeadFigure / LeadRow** (`components/lead-figure.tsx`): the page's one large number with what it counts above and its limits below; `LeadRow` puts the supporting tiles beside it.
- **StatTile** (`components/data-table/stat-tile.tsx`): label, value in the figure face, optional "Est." badge, hint and glossary "?". Sits under a 2px rule.
- **Rank, Movement, MoveArrow** (`components/rank.tsx`): position numerals and how far a row moved. **GrowthBadge** shows a signed percentage with its arrow.
- **Table** (`components/ui/table.tsx`): muted 13px heads over the heavy rule, hairline rows, hover on the muted surface. The first column of a ranked table is `Rank size="sm"`, the name is bold, and the column the table is ranked by is in the figure face.
- **MobileCards** (`components/data-table/mobile-cards.tsx`): the phone form of a wide table.
- **Ruled list**: `divide-y border-b` with rows of `py-2.5` and `hover:bg-muted/60`, for short ranked or chronological lists.
- **PresetLinks** (`components/filters/preset-links.tsx`): pill links that set one query parameter; the selected pill is filled blue.
- **GenreBadge / GenreDot** (`components/genre-badge.tsx`): the genre's square and name.
- **ShareBar** (`components/share-bar.tsx`): a 2px-radius horizontal bar for a share or score, always beside its number.
- **Sparkline** (`components/sparkline.tsx`): a plain SVG line of the last 7 daily averages; missing days break the line.
- **EmptyState / ChartEmpty** (`components/empty-state.tsx`): what is missing and when it fills in, between two hairlines. The amber square marks thin data; `tone="plain"` is for a filter that matched nothing.
- **Charts** (`components/charts/*`): Recharts with `--chart-line`, `--up`, `--down` and genre or series colours. No frame; periods with no collection are shaded and labelled.
- **Share image and badge** (`lib/og-card.tsx`, `lib/badge.ts`): the band with the blue edge, the mark and stats on rules; the badge is ink and Action Blue. Both write the token values out, since neither can read CSS variables.

## Do's and Don'ts

**Do**

- Give each page one lead: a `LeadFigure` or the ranked chart at the top.
- Put the trust information next to the number: an "Est." badge, the sample size, the date collected.
- Say what is missing and when it fills in, with `EmptyState`.
- Use the shared pieces above before writing new markup.
- Check both themes; the top bar stays ink in light.

**Don't**

- Don't box content in bordered, rounded cards, or nest one container in another.
- Don't use colour as decoration, gradients, glows, or blur.
- Don't add motion that suggests a live feed: no tickers, flips, pulsing dots or auto-refreshing counters.
- Don't put a small label above a heading, or number sections.
- Don't show a derived value without its "Est." or "Projection" label.
- Don't write advice. Describe the pattern and stop.
