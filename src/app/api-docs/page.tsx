import Link from "next/link";

import { RANGE_KEYS } from "@/lib/date-range";
import { RISING } from "@/lib/db/trends";
import { EXPORT_GAME_SORTS, EXPORT_MAX_GAMES, EXPORT_TRENDING_ROWS } from "@/lib/export-data";
import {
  BIG_MOVE_MIN_PCT,
  BIG_MOVE_MIN_PLAYERS,
  FEED_MAX_ENTRIES,
  FEED_MAX_IDS,
  FEED_WINDOW_DAYS,
} from "@/lib/feed";
import {
  AGE_OPTIONS,
  LIKE_RATIO_MIN_VOTES,
  MIN_PLAYERS_OPTIONS,
  STATUS_OPTIONS,
} from "@/lib/games-list";
import { GENRES } from "@/lib/taxonomy/genres";
import { THEMES } from "@/lib/taxonomy/themes";
import { SITE_URL } from "@/lib/site";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CopyCode } from "@/components/copy-code";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "API and feeds — rodict",
  description:
    "Download rodict's tables as CSV or JSON, follow a watchlist or the weekly recap in a feed reader, and embed a live badge. No key needed.",
};

/**
 * Docs for everything outside the pages (Task #115): the export API, the Atom
 * feeds and the badge. Static: every limit, option and slug is imported from
 * the code that enforces it, so the docs can't drift from the behaviour.
 */

const ORIGIN = SITE_URL.replace(/\/$/, "");
/** A placeholder, not a real game: the number in a game page's URL. */
const UNIVERSE = "<universe id>";
const SLUG_EXAMPLE = GENRES[0].slug;
const THEME_EXAMPLE = THEMES[0].slug;

const list = (values: readonly (string | number)[]) =>
  values.map((v, i) => (
    <span key={v}>
      {i > 0 && ", "}
      <code>{v}</code>
    </span>
  ));

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex min-w-0 scroll-mt-6 flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Endpoint({ path, children }: { path: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">GET</Badge>
      <code className="text-sm font-medium">{path}</code>
      {children}
    </div>
  );
}

function Params({
  rows,
}: {
  rows: { name: string; values: React.ReactNode; notes: React.ReactNode }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border xl:overflow-visible">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Parameter</TableHead>
            <TableHead>Values</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="align-top font-mono text-xs">{r.name}</TableCell>
              <TableCell className="align-top text-xs whitespace-normal">{r.values}</TableCell>
              <TableCell className="align-top text-xs whitespace-normal text-muted-foreground">
                {r.notes}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Examples({ items }: { items: { what: string; code: string }[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-medium">Examples</h3>
      {items.map((e) => (
        <div key={e.code} className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted-foreground">{e.what}</span>
          <CopyCode code={e.code} />
        </div>
      ))}
    </div>
  );
}

const FORMAT_PARAM = {
  name: "format",
  values: list(["csv", "json"]),
  notes: "Default csv.",
};
const RANGE_PARAM = (notes: React.ReactNode) => ({
  name: "range",
  values: list(RANGE_KEYS),
  notes,
});

export default function ApiDocsPage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8 p-6">
      <PageHeader
        title="API and feeds"
        description="Download rodict's tables as CSV or JSON, follow a watchlist or the weekly recap in a feed reader, and embed a live badge. Everything is a plain GET: no key, no account."
      />

      <nav aria-label="On this page" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {[
          ["#basics", "Basics"],
          ["#export", "Export API"],
          ["#export-games", "games"],
          ["#export-trending", "trending"],
          ["#export-snapshots", "snapshots"],
          ["#feeds", "Atom feeds"],
          ["#badge", "Badge"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="underline underline-offset-4 hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <Section id="basics" title="Basics">
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Base URL: <code>{ORIGIN}</code>. Every endpoint is read-only and needs no key.
          </li>
          <li>
            Data changes every few hours (busy games are collected every 3h, the rest about once a
            day), and responses are cached for 15–60 minutes, so polling more often than every 15
            minutes returns the same thing. Please keep it gentle: this is a free personal project.
          </li>
          <li>
            Times are UTC (ISO 8601). Nothing was collected from 2026-08-20 to 2026-09-29; a gap is
            missing readings, not zero players.
          </li>
          <li>
            Figures cover the games rodict tracks, not all of Roblox. Estimated columns start with{" "}
            <code>est_</code> and are rodict&apos;s estimates, not Roblox data (see{" "}
            <Link href="/about" className="underline underline-offset-4">
              About the data
            </Link>
            ). Every export carries notes saying what&apos;s estimated and how it was filtered.
          </li>
          <li>
            A bad request gets a <code>400</code> or <code>404</code> with a one-line plain-text
            message saying what to fix.
          </li>
          <li>
            Please credit rodict and Roblox (the original source) if you publish anything built on
            this data.
          </li>
        </ul>
      </Section>

      <Section id="export" title="Export API">
        <Endpoint path="/api/export/{dataset}" />
        <p className="max-w-3xl text-sm text-muted-foreground">
          The same tables as the site&apos;s Export buttons. CSV is RFC 4180 with a UTF-8 byte order
          mark, so Excel reads emoji and accents in names, and text starting with{" "}
          <code>= + - @</code> is prefixed with an apostrophe so a spreadsheet can&apos;t run it as
          a formula. JSON is <code>{"{ dataset, generatedAt, notes, rows }"}</code> with one object
          per row. Both are sent as a download named like <code>rodict-games-2026-10-01.csv</code>.
        </p>

        <div id="export-games" className="flex min-w-0 scroll-mt-6 flex-col gap-3 pt-2">
          <h3 className="font-medium">games</h3>
          <Endpoint path="/api/export/games" />
          <p className="max-w-3xl text-sm text-muted-foreground">
            The games list, filtered and sorted like{" "}
            <Link href="/games" className="underline underline-offset-4">
              /games
            </Link>
            , up to {EXPORT_MAX_GAMES.toLocaleString("en-US")} rows (busiest first by default; the
            notes say when more matched). Columns: universe id, name, creator, genre, status,
            players now, all-time peak, visits, favorites, votes, Roblox created/updated times,
            first tracked, last collected, <code>est_earnings_low_usd_per_day</code>,{" "}
            <code>est_earnings_high_usd_per_day</code>, <code>est_earnings_pass_tier</code>, and{" "}
            <code>est_session_minutes</code> when sorted by session.
          </p>
          <Params
            rows={[
              {
                name: "genre",
                values: "a genre slug",
                notes: (
                  <>
                    e.g. <code>{SLUG_EXAMPLE}</code>; the slug is the last part of a genre
                    page&apos;s URL.
                  </>
                ),
              },
              {
                name: "theme",
                values: "a theme slug",
                notes: (
                  <>
                    e.g. <code>{THEME_EXAMPLE}</code>.
                  </>
                ),
              },
              {
                name: "status",
                values: list(STATUS_OPTIONS.map((o) => o.value)),
                notes: "Default: both.",
              },
              {
                name: "age",
                values: list(AGE_OPTIONS.map((o) => o.value)),
                notes: "By Roblox creation date; older = created more than a year ago.",
              },
              {
                name: "min",
                values: list(MIN_PLAYERS_OPTIONS),
                notes: "At least this many players now. Other numbers are ignored.",
              },
              { name: "q", values: "text", notes: "Name search, up to 100 characters." },
              {
                name: "sort",
                values: list(EXPORT_GAME_SORTS),
                notes: `Default currentPlaying. likeRatio only includes games with ${LIKE_RATIO_MIN_VOTES}+ votes; growth needs a range other than all and only includes games averaging ${RISING.minBaseline}+ players at the start; session only includes games with an estimate.`,
              },
              { name: "order", values: list(["desc", "asc"]), notes: "Default desc." },
              RANGE_PARAM("Only used by sort=growth: the window growth is measured over."),
              FORMAT_PARAM,
            ]}
          />
          <Examples
            items={[
              {
                what: `Active ${GENRES[0].name} games as CSV, busiest first`,
                code: `${ORIGIN}/api/export/games?genre=${SLUG_EXAMPLE}&status=active`,
              },
              {
                what: "Fastest-growing games over 7 days with 100+ players, as JSON",
                code: `${ORIGIN}/api/export/games?sort=growth&range=7d&min=100&format=json`,
              },
              {
                what: "Games created in the last 30 days",
                code: `curl -OJ "${ORIGIN}/api/export/games?age=30d"`,
              },
            ]}
          />
        </div>

        <div id="export-trending" className="flex min-w-0 scroll-mt-6 flex-col gap-3 pt-2">
          <h3 className="font-medium">trending</h3>
          <Endpoint path="/api/export/trending" />
          <p className="max-w-3xl text-sm text-muted-foreground">
            The rising games or genres from{" "}
            <Link href="/trending" className="underline underline-offset-4">
              /trending
            </Link>
            , up to {EXPORT_TRENDING_ROWS} rows. Growth compares average players over the first{" "}
            {RISING.avgWindowHours}h of the range with the last {RISING.avgWindowHours}h; only
            series starting at {RISING.minBaseline}+ players that grew are listed. Columns: rank, id
            (universe id or slug), name, <code>avg_players_start</code>,{" "}
            <code>avg_players_end</code>, <code>growth_ratio</code> (a fraction: 0.25 = +25%).
          </p>
          <Params
            rows={[
              { name: "kind", values: list(["games", "genres"]), notes: "Required." },
              RANGE_PARAM("Default all (the whole collected history)."),
              FORMAT_PARAM,
            ]}
          />
          <Examples
            items={[
              {
                what: "Top rising games this week, as JSON",
                code: `${ORIGIN}/api/export/trending?kind=games&range=7d&format=json`,
              },
              {
                what: "Rising genres over 30 days, as CSV",
                code: `${ORIGIN}/api/export/trending?kind=genres&range=30d`,
              },
            ]}
          />
        </div>

        <div id="export-snapshots" className="flex min-w-0 scroll-mt-6 flex-col gap-3 pt-2">
          <h3 className="font-medium">snapshots</h3>
          <Endpoint path="/api/export/snapshots" />
          <p className="max-w-3xl text-sm text-muted-foreground">
            One game&apos;s raw readings, oldest first, as collected from Roblox&apos;s public API:
            <code> collected_at</code>, players, visits, favorites and votes. No estimates. An
            unknown game gets a <code>404</code>.
          </p>
          <Params
            rows={[
              {
                name: "game",
                values: "a universe id",
                notes: "Required. The number in a game page's URL (/games/<universe id>).",
              },
              RANGE_PARAM("Default all."),
              FORMAT_PARAM,
            ]}
          />
          <Examples
            items={[
              {
                what: "A game's last 30 days of readings (replace the universe id)",
                code: `${ORIGIN}/api/export/snapshots?game=${UNIVERSE}&range=30d&format=json`,
              },
            ]}
          />
        </div>
      </Section>

      <Section id="feeds" title="Atom feeds">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Paste one into any feed reader (Feedly, Inoreader, Thunderbird, a Slack or Discord RSS
          app…) to be told when something changes. Both are Atom 1.0.
        </p>

        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="font-medium">Watchlist feed</h3>
          <Endpoint path="/feed?games={ids}&genres={slugs}" />
          <p className="max-w-3xl text-sm text-muted-foreground">
            Flagged spikes and drops and big week-over-week moves (24h average players changing by
            at least {BIG_MOVE_MIN_PCT * 100}% and {BIG_MOVE_MIN_PLAYERS} players) for the games and
            genres you list: comma-separated universe ids and genre slugs, up to {FEED_MAX_IDS} of
            each (extra or malformed ids are ignored). Entries from the last {FEED_WINDOW_DAYS}{" "}
            days, at most {FEED_MAX_ENTRIES}. The URL holds the list, so nothing is stored; the{" "}
            <Link href="/watchlist" className="underline underline-offset-4">
              Watchlist
            </Link>{" "}
            page builds it for you (&ldquo;Copy feed URL&rdquo;). Without any ids it returns a{" "}
            <code>400</code>.
          </p>
          <Examples
            items={[
              {
                what: `Everything flagged in ${GENRES[0].name} and ${GENRES[1].name}`,
                code: `${ORIGIN}/feed?genres=${GENRES[0].slug},${GENRES[1].slug}`,
              },
              {
                what: "A game plus a genre (replace the universe id)",
                code: `${ORIGIN}/feed?games=${UNIVERSE}&genres=${SLUG_EXAMPLE}`,
              },
            ]}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3 pt-2">
          <h3 className="font-medium">Weekly recap feed</h3>
          <Endpoint path="/weekly/feed" />
          <p className="max-w-3xl text-sm text-muted-foreground">
            One entry per ISO week: the top risers, new entrants, games that went dead and the
            biggest spikes of the last 7 days, the same as{" "}
            <Link href="/weekly" className="underline underline-offset-4">
              /weekly
            </Link>
            . No parameters.
          </p>
          <Examples items={[{ what: "The weekly recap", code: `${ORIGIN}/weekly/feed` }]} />
        </div>
      </Section>

      <Section id="badge" title="Badge">
        <Endpoint path="/badge/{universe id}.svg" />
        <p className="max-w-3xl text-sm text-muted-foreground">
          A small SVG badge for a README, devforum post or website, showing a game&apos;s players
          now, or with <code>?metric=rank</code> its rank by players now among every tracked game.
          It refreshes within the hour (cached 30 minutes). A game rodict doesn&apos;t track gets a
          grey &ldquo;not tracked&rdquo; badge with a <code>404</code>, so an embed never shows a
          broken image. Each game page has ready-made embed code under &ldquo;Embed a live
          badge&rdquo;.
        </p>
        <Params
          rows={[
            {
              name: "metric",
              values: list(["players", "rank"]),
              notes: "Default players.",
            },
          ]}
        />
        <Examples
          items={[
            {
              what: "Markdown (replace the universe id in both places)",
              code: `[![Players now on rodict](${ORIGIN}/badge/${UNIVERSE}.svg)](${ORIGIN}/games/${UNIVERSE})`,
            },
            {
              what: "HTML, showing the rank",
              code: `<a href="${ORIGIN}/games/${UNIVERSE}"><img src="${ORIGIN}/badge/${UNIVERSE}.svg?metric=rank" alt="Rank by players on rodict"></a>`,
            },
          ]}
        />
      </Section>
    </div>
  );
}
