import { COLLECTION_CADENCE } from "@/lib/collector/cadence";
import { BUDGET_GUARD } from "@/lib/collector/budget-guard";
import { GENRE_CARRY_MAX_AGE_HOURS } from "@/lib/db/genre-snapshots";
import { RISING } from "@/lib/db/trends";
import { SERIES_GAP_DAYS } from "@/lib/stats";
import { UPDATE_WINDOWS_HOURS } from "@/lib/update-impact";
import { HIT_PEAK_PLAYERS } from "@/lib/creators";
import { FAVORITES_MIN_VISITS, SESSION_ESTIMATE } from "@/lib/engagement";
import { LIKE_RATIO_MIN_VOTES } from "@/lib/games-list";
import { BIG_MOVE_MIN_PCT, BIG_MOVE_MIN_PLAYERS, FEED_WINDOW_DAYS } from "@/lib/feed";
import Link from "next/link";

import { EARNINGS_ASSUMPTIONS } from "@/lib/earnings/estimate";
import { DEVEX_SCHEDULES } from "@/lib/earnings/devex";
import { GENRES } from "@/lib/taxonomy/genres";
import { THEMES } from "@/lib/taxonomy/themes";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "About the data — rodict",
  description:
    "Where rodict's numbers come from, how they're collected, what the definitions mean, and why earnings and forecasts are estimates — not real revenue.",
};

/**
 * Static by design: every number on this page comes from a module import, not
 * the DB, so the route prerenders into the static shell with no per-request
 * work. That also means the constants below are the SAME ones the app computes
 * with — the page can't drift from the real assumptions the way hardcoded prose
 * would. (The DevEx schedule, earnings assumptions, collection cadence, and genre
 * taxonomy are all imported, not retyped.)
 */

const utcDate = (d: Date) => d.toISOString().slice(0, 10);

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
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">About the data</h1>
        <p className="max-w-2xl text-muted-foreground">
          rodict shows statistics about Roblox games and genres so you can spot patterns yourself.
          It never tells you what to build. This page explains exactly where every number comes
          from, how it&apos;s collected, and — importantly — which numbers are{" "}
          <span className="font-medium text-foreground">estimates rather than facts</span>.
        </p>
      </header>

      {/* The single most important disclosure on the site gets the most prominent treatment. */}
      <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <h2 className="font-semibold">Earnings and forecasts are estimates</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Roblox publishes no per-game revenue. Every earnings figure on this site is{" "}
          <span className="font-medium text-foreground">derived from public signals</span> (player
          counts and visits) multiplied by rough assumptions — never a real revenue figure. They
          carry an <Badge variant="secondary">Est.</Badge> badge and are always shown as a wide
          range. Forecasts are projections with uncertainty bands, not predictions.{" "}
          <a href="#earnings" className="underline underline-offset-4">
            How the estimate works ↓
          </a>
        </p>
      </div>

      <Section id="sources" title="Where the data comes from">
        <p className="max-w-2xl text-muted-foreground">
          All raw data comes from Roblox&apos;s <strong>public, semi-official web APIs</strong> —
          the same endpoints the Roblox website itself calls. No private, scraped-from-HTML, or
          logged-in data is used, and nothing is collected about individual players.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Signal</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  Game details — name, creator, created/updated dates, concurrent players, visits,
                  favorites, genre tags
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  games.roblox.com/v1/games
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Likes / dislikes</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  games.roblox.com/v1/games/votes
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Icons and thumbnails</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  thumbnails.roblox.com/v1
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">
                  Game discovery (finding new games to track)
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  apis.roblox.com — omni-search
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          rodict is an unofficial, personal project and is{" "}
          <strong>not affiliated with or endorsed by Roblox Corporation</strong>. Roblox is the
          source of the underlying data; the analysis and any errors in it are ours. The collector
          respects rate limits and backs off politely.
        </p>
      </Section>

      <Section id="collection" title="How collection works">
        <p className="max-w-2xl text-muted-foreground">
          Roblox&apos;s APIs only ever return <strong>right now</strong> — there is no historical
          endpoint. So every trend on this site is built from snapshots rodict recorded itself. A
          scheduled job runs <strong>every {COLLECTION_CADENCE.runIntervalHours} hours</strong> and
          writes one timestamped row per game it collects. Busy games (at least{" "}
          {COLLECTION_CADENCE.busyMinPlaying} players, or first seen in the last{" "}
          {COLLECTION_CADENCE.newGameDays} days) are collected on every run; quieter games about
          once every {`${COLLECTION_CADENCE.lowIntervalHours} hours`}, which keeps the database
          inside its hosting plan&apos;s write limits. History therefore only exists from the day
          collection started, and it cannot be backfilled.
        </p>
        <ul className="max-w-2xl list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">
              Games are followed until they die, not dropped.
            </strong>{" "}
            Every game already in the database keeps being re-collected (quiet ones daily), in
            addition to newly discovered ones. This is deliberate: if we only ever tracked whatever
            is popular today, games that failed would silently vanish from the dataset and every
            lifespan and survival statistic would be wrong — a mistake known as{" "}
            <em>survivorship bias</em>.
          </li>
          <li>
            <strong className="text-foreground">Collection slows down rather than stopping.</strong>{" "}
            If a month&apos;s database writes are on course to pass {BUDGET_GUARD.reduceAt * 100}%
            of the hosting plan&apos;s limit, only busy games are collected (no quiet games, no new
            discoveries) until the month resets; past {BUDGET_GUARD.pauseAt * 100}% already used,
            collection pauses. Scheduled runs also keep to an even pace through the month: when
            writes run ahead of it, a run is skipped so the budget lasts to the month&apos;s end.
            Quiet games can have longer gaps in such a month.
          </li>
          <li>
            <strong className="text-foreground">All timestamps are stored in UTC</strong> and
            converted to your local time only for display.
          </li>
          <li>
            <strong className="text-foreground">Bad data is rejected, not stored.</strong> Responses
            are validated before writing — negative counts, blank names, impossible timestamps, and
            duplicates are dropped, because a bad row poisons the statistics permanently and can
            never be re-fetched.
          </li>
          <li>
            <strong className="text-foreground">Heavy statistics are precomputed</strong> by
            scheduled Python jobs twice a day, then stored. Nothing statistical is computed while
            you load a page.
          </li>
        </ul>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The footer always shows when data was last collected successfully. If a run fails, the
          site says so rather than quietly showing you aging numbers as if they were current.
        </p>
      </Section>

      <Section id="earnings" title="How the earnings estimate works">
        <p className="max-w-2xl text-muted-foreground">
          Roblox has published no per-game revenue API, and gamepass/developer-product sale counts
          have been private since July 2020. There is no way to know what a game actually earns. So
          rodict does what the reference sites do: estimate from signals that <em>are</em> public.
        </p>
        <p className="max-w-2xl text-muted-foreground">
          The estimate is deliberately simple and honest about its own crudeness: take a public
          signal, multiply by an assumed Robux-per-unit range, and convert to USD at the DevEx rate
          that was in effect on the snapshot&apos;s date.
        </p>

        <h3 className="pt-2 font-medium">The assumptions</h3>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assumption</TableHead>
                <TableHead className="text-right">Low</TableHead>
                <TableHead className="text-right">Mid</TableHead>
                <TableHead className="text-right">High</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  Robux earned per concurrent player, per day
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.low}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.mid}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.high}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Robux earned per new visit</TableCell>
                <TableCell className="text-right tabular-nums">
                  {EARNINGS_ASSUMPTIONS.robuxPerVisit.low}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {EARNINGS_ASSUMPTIONS.robuxPerVisit.mid}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {EARNINGS_ASSUMPTIONS.robuxPerVisit.high}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          These are rough, genre-agnostic guesses with a wide band, because monetization varies
          enormously between games. Two games with identical player counts can differ by an order of
          magnitude in real revenue. The range is wide on purpose — a narrow range would imply a
          precision that does not exist.
        </p>

        <h3 className="pt-2 font-medium">Game passes position the range</h3>
        <p className="max-w-2xl text-muted-foreground">
          Game-pass <em>prices</em> are public, even though sales aren&apos;t. Once a week rodict
          reads each active game&apos;s on-sale passes and uses them to narrow a single game&apos;s
          players-based estimate to part of the range above, never beyond it:
        </p>
        <ul className="max-w-2xl list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>No passes on sale:</strong> the lower half (
            {EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.low}–
            {EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.mid} Robux per player per day).
          </li>
          <li>
            <strong>
              Buying every pass costs{" "}
              {EARNINGS_ASSUMPTIONS.gamePasses.richTotalRobux.toLocaleString("en-US")} Robux or
              more:
            </strong>{" "}
            the upper half ({EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.mid}–
            {EARNINGS_ASSUMPTIONS.robuxPerCcuPerDay.high}).
          </li>
          <li>
            <strong>Anything in between, or not checked yet:</strong> the full range.
          </li>
        </ul>
        <p className="max-w-2xl text-sm text-muted-foreground">
          This is an assumption, not a measurement. A price list says what a game offers, not how
          much of it sells. Developer products (one-off purchases such as in-game currency) are
          often most of a game&apos;s revenue and aren&apos;t listed publicly at all, so a game with
          no passes can still earn well. Totals for genres, themes, creators and the dashboard use
          the full range, since they add up many games. The game page lists the passes, and each
          list is only re-saved when it changes.
        </p>

        <h3 className="pt-2 font-medium">The DevEx rate</h3>
        <p className="max-w-2xl text-muted-foreground">
          Robux is converted to USD at the <strong>Developer Exchange (DevEx)</strong> rate — what
          Roblox actually pays out per Robux cashed out. The rate changes over time, so an estimate
          for an older snapshot uses the rate that was in effect on that date:
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead>In effect from</TableHead>
                <TableHead className="text-right">USD per Robux</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEVEX_SCHEDULES.standard.map((r) => (
                <TableRow key={`standard-${r.usdPerRobux}`}>
                  <TableCell className="font-medium">Standard</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.from.getUTCFullYear() <= 2000 ? "(legacy)" : utcDate(r.from)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${r.usdPerRobux.toFixed(4)}
                  </TableCell>
                </TableRow>
              ))}
              {DEVEX_SCHEDULES.us18Plus.map((r) => (
                <TableRow key={`us18-${r.usdPerRobux}`}>
                  <TableCell className="font-medium">
                    US 18+ in-experience
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      not the default
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {utcDate(r.from)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${r.usdPerRobux.toFixed(4)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Estimates use the <strong>standard</strong> tier. The US 18+ rate is tracked but not
          applied, since we can&apos;t know what share of a game&apos;s Robux would qualify.
        </p>

        <h3 className="pt-2 font-medium">What the estimate cannot know</h3>
        <ul className="max-w-2xl list-disc space-y-1 pl-5 text-muted-foreground">
          <li>How a specific game monetizes, or whether it monetizes at all.</li>
          <li>Actual gamepass, developer-product, or premium-payout revenue.</li>
          <li>Roblox&apos;s platform cut, marketplace fees, taxes, or ad spend.</li>
          <li>Whether the developer ever cashes out at the DevEx rate at all.</li>
        </ul>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Treat the numbers as a way to compare games against each other at a glance — an order of
          magnitude, not an income statement.
        </p>
      </Section>

      <Section id="forecasts" title="Forecasts, scores, and other derived numbers">
        <p className="max-w-2xl text-muted-foreground">
          Several figures on this site are computed, not observed. Each is labeled where it appears:
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Figure</TableHead>
                <TableHead>What it actually is</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Forecast / projection</TableCell>
                <TableCell className="text-muted-foreground">
                  Holt&apos;s exponential smoothing extended from the recent trend, with an ~80%
                  uncertainty band that widens the further out it goes. It assumes the recent trend
                  continues — it cannot anticipate an update, a viral moment, or a shutdown. It runs
                  a few collection runs ahead of the last point it was fitted on, and is drawn
                  dashed after the real data, always with its band.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Opportunity score (0–100)</TableCell>
                <TableCell className="text-muted-foreground">
                  A weighted composite of demand intensity, total demand, momentum, and crowding,
                  normalized across genres. It is a <em>descriptive signal</em>, not advice, and the
                  weights are a judgment call.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Median genre lifespan</TableCell>
                <TableCell className="text-muted-foreground">
                  Kaplan-Meier survival analysis using the dead rule below. Games still alive are
                  correctly censored rather than counted as dead, and games we started watching
                  mid-life are left-truncated. Needs games followed to death to mean anything. The
                  genre page draws the full curve (share still alive by age) with the number of
                  games and deaths it rests on.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">When players are on (seasonality)</TableCell>
                <TableCell className="text-muted-foreground">
                  A genre&apos;s players averaged by weekday and hour, divided by its overall
                  average, shown in your own timezone. It describes when players were online over
                  the history collected; a genre that grew during that time also reads busier on
                  later days. Needs at least 7 distinct days, and hours the collector didn&apos;t
                  run stay blank.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Rising games and genres</TableCell>
                <TableCell className="text-muted-foreground">
                  Average players over the first {RISING.avgWindowHours}h of the chosen window
                  compared with the last {RISING.avgWindowHours}h, so the daily cycle of Roblox
                  traffic isn&apos;t mistaken for growth. Only series averaging at least{" "}
                  {RISING.minBaseline} players at the start are ranked, and the starting average is
                  shown next to every percentage.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Genre players over time</TableCell>
                <TableCell className="text-muted-foreground">
                  Each point sums one collection run. Quiet games, collected about daily, count with
                  their latest reading for up to {GENRE_CARRY_MAX_AGE_HOURS}h; older readings are
                  left out, and each point records the share of the genre&apos;s games it includes.
                  Collection gaps of more than {SERIES_GAP_DAYS} days are drawn as missing, not as a
                  line across them.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Notable changes (spikes / drops)</TableCell>
                <TableCell className="text-muted-foreground">
                  A step is flagged only if it is both statistically unusual for that game&apos;s
                  own curve (robust z-score of at least 5 using median/MAD) <em>and</em> large in
                  absolute terms (at least 25%). Both bars are required — judged on unusualness
                  alone, an ordinary wiggle on a very steady curve scores as an extreme outlier.
                  Unusualness is measured on a log scale, so a fall and the recovery from it count
                  the same, and a game&apos;s ordinary daily rise out of its overnight low
                  isn&apos;t flagged. A step must also move at least 50 players, so a small game
                  going from 8 to 12 isn&apos;t flagged. Steps across a collection gap, or spanning
                  much longer than the game&apos;s usual time between readings, aren&apos;t compared
                  at all.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Launch benchmarks</TableCell>
                <TableCell className="text-muted-foreground">
                  For each day since launch (up to day 90), the spread of a genre&apos;s games&apos;
                  daily average players, stored as every 5th percentile. A game page places the game
                  on its latest complete day (&ldquo;Day 14: above 82% of Simulator
                  launches&rdquo;), and the genre lifecycle chart shades the middle half. Only games
                  we started tracking within 7 days of their Roblox creation date count: a game we
                  found in week 6 was found <em>because</em> it was doing well, and would raise the
                  bar. Games stay in after they die. A day needs at least 5 games. Recomputed after
                  each collection.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Est. session length</TableCell>
                <TableCell className="text-muted-foreground">
                  Little&apos;s law: average players = arrivals per hour × average time each stays,
                  so time per visit ≈ player-hours ÷ visits over the same span. For each pair of
                  readings in the last {SESSION_ESTIMATE.windowHours}h we take the average players ×
                  the hours between them, and the change in Roblox&apos;s visit counter. Pairs less
                  than {SESSION_ESTIMATE.minGapHours}h or more than {SESSION_ESTIMATE.maxGapHours}h
                  apart are skipped (the counter moves in steps, and a long gap hides what happened
                  in it), as are pairs where the counter went backwards. A game needs{" "}
                  {`${SESSION_ESTIMATE.minCoveredHours}h of counted pairs and ${SESSION_ESTIMATE.minVisits.toLocaleString("en-US")} visits`}{" "}
                  or it shows no estimate. A genre pools its games, so busier games weigh more.
                  Caveats: a visit is a join, not a person, so rejoining after a disconnect or
                  server hop splits one sitting into several; it assumes play is roughly steady over
                  the day; and idle/AFK games read long because players stay in without new joins.
                  Labeled <Badge variant="secondary">Est.</Badge> everywhere.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Favorites per 1K visits · like ratio</TableCell>
                <TableCell className="text-muted-foreground">
                  Ratios of Roblox&apos;s own all-time counters, not estimates: favorites ÷ visits ×
                  1,000 (shown from {FAVORITES_MIN_VISITS.toLocaleString("en-US")} visits), and
                  likes ÷ (likes + dislikes). The like-ratio trend on a game page is the change
                  between the first and last reading in the chosen range with at least{" "}
                  {LIKE_RATIO_MIN_VOTES} votes, in percentage points. A genre&apos;s ratios add up
                  all its games&apos; counters, so big games dominate.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Correlations</TableCell>
                <TableCell className="text-muted-foreground">
                  Spearman rank correlation and random-forest feature importance, shown as{" "}
                  <strong>associational, not causal</strong>. That visits correlate with players
                  does not mean visits cause players.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Trajectory archetypes</TableCell>
                <TableCell className="text-muted-foreground">
                  k-means clustering on scale-free curve-shape features, labeled from the cluster
                  centroids. The labels (Rising, Fading, Volatile, Steady) are our names for
                  clusters, not categories Roblox recognizes.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Players after updates</TableCell>
                <TableCell className="text-muted-foreground">
                  Average players in the {UPDATE_WINDOWS_HOURS.join("h and ")}h before a game&apos;s
                  Roblox &ldquo;last updated&rdquo; time vs. the same span after. Roblox also bumps
                  that time for some settings edits, only the latest change between two collections
                  is seen, and history only goes back to when it started being recorded.{" "}
                  <strong>Observational, not causal</strong>: games tend to update before weekends
                  and events, when play rises anyway.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section id="definitions" title="Definitions">
        <dl className="max-w-2xl space-y-4">
          <div>
            <dt className="font-medium">Dead / died off</dt>
            <dd className="text-muted-foreground">
              A game whose concurrent player count stayed below{" "}
              <strong>5% of its own all-time peak</strong> for{" "}
              <strong>7 or more consecutive days</strong>. This is an operational rule we chose, not
              a Roblox status — a &quot;dead&quot; game is still online and playable. It&apos;s
              measured against each game&apos;s own peak, so a small game that was never popular
              isn&apos;t counted as dead just for being small.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Active</dt>
            <dd className="text-muted-foreground">
              Not dead — the game still has meaningful players relative to its own history.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Players / CCU</dt>
            <dd className="text-muted-foreground">
              Concurrent players — how many people were in the game at the moment of the snapshot.
              Not a daily-active-user count, and not a total.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Visits</dt>
            <dd className="text-muted-foreground">
              Roblox&apos;s cumulative, all-time visit counter for a game — it only ever goes up,
              and counts joins rather than unique people. Growth in visits is more informative than
              the total.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Genre</dt>
            <dd className="text-muted-foreground">
              {/* Count and unit kept in ONE expression: when a JSX text chunk that follows an
                  expression wraps across lines, its leading space is dropped and this renders
                  "20of them". Prettier reformats `{" "}` away, so the space lives in here. */}
              Our own normalized <em>gameplay</em> genre ({`${GENRES.length} of them`}), mapped from
              Roblox&apos;s tags. We deliberately do <strong>not</strong> use Roblox&apos;s built-in
              genre field: it&apos;s deprecated and describes theme (Fantasy, Ninja, Town and City)
              rather than how a game actually plays. Where the tags are wrong, a manual override
              wins. Where nothing is confident, a game is left unclassified rather than forced into
              a wrong genre.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Theme</dt>
            <dd className="text-muted-foreground">
              A cross-cutting tag ({`${THEMES.length} of them`}, e.g. Anime, Fantasy, Sci-Fi)
              tracked separately from genre — &quot;Anime Fighting Simulator&quot; is genre{" "}
              <em>Simulator</em>, theme <em>Anime</em>.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Hit (creator pages)</dt>
            <dd className="text-muted-foreground">
              A game whose all-time peak, as we observed it, reached{" "}
              <strong>{HIT_PEAK_PLAYERS.toLocaleString("en-US")} concurrent players</strong>. Our
              own threshold, not a Roblox label. The peak only covers the time since we started
              tracking the game, so an older game&apos;s launch peak can be missed.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Watchlist feed</dt>
            <dd className="text-muted-foreground">
              The Atom feed on the watchlist page lists flagged spikes and drops from the last{" "}
              {FEED_WINDOW_DAYS} days, plus <strong>big weekly moves</strong>: average players in
              the last 24h vs. the same 24h a week earlier, when the change is at least{" "}
              {`${Math.round(BIG_MOVE_MIN_PCT * 100)}% and ${BIG_MOVE_MIN_PLAYERS} players`}. The
              watched ids live in the feed URL; nothing is stored about you.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Est. earnings</dt>
            <dd className="text-muted-foreground">
              A derived range, never real revenue. See{" "}
              <a href="#earnings" className="underline underline-offset-4">
                how the estimate works
              </a>
              .
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="retention" title="How long data is kept">
        <p className="max-w-2xl text-muted-foreground">
          Every snapshot is kept at full collection resolution — nothing is thinned or deleted. The
          database is on a free tier where storage is far from its limit but every deleted row
          counts against a monthly write limit, so pruning old data would cost more than keeping it.
          A game&apos;s all-time peak is stored separately in any case, so the dead rule never
          depends on old snapshots surviving.
        </p>
      </Section>

      <Section id="limitations" title="Limitations worth knowing">
        <ul className="max-w-2xl list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">History is short.</strong> Collection started
            recently, so anything needing weeks or months of data — survival curves, seasonality,
            forecasts — is thin or unavailable. Those sections say so explicitly rather than showing
            a confident-looking number computed from noise.
          </li>
          <li>
            <strong className="text-foreground">History has a gap.</strong> Nothing was collected
            from 20 August to 29 September 2026, after the database hit its hosting plan&apos;s
            monthly write limit. Charts show that span as missing data, and it can&apos;t be filled
            in later.
          </li>
          <li>
            <strong className="text-foreground">The dataset is a sample, not all of Roblox.</strong>{" "}
            rodict tracks the games it has discovered, not every game on the platform. Genre totals
            are totals <em>of what we track</em>.
          </li>
          <li>
            <strong className="text-foreground">Snapshots are point-in-time.</strong> Players are
            sampled every few hours, so a short spike between two snapshots is invisible. Roblox
            traffic also swings by time of day, and a game&apos;s numbers depend on when it was
            sampled.
          </li>
          <li>
            <strong className="text-foreground">Genre mapping is imperfect.</strong> It relies on
            Roblox&apos;s tags plus keyword inference, both of which get games wrong.
          </li>
          <li>
            <strong className="text-foreground">Roblox&apos;s APIs are unversioned</strong> and can
            change or break without notice.
          </li>
        </ul>
      </Section>

      <Section id="descriptive" title="Descriptive, not prescriptive">
        <p className="max-w-2xl text-muted-foreground">
          Everything here shows patterns and lets you draw the conclusion. rodict does not rank what
          you should build, and a high opportunity score is not a recommendation — an under-served
          genre may be under-served because players don&apos;t want it. The statistics describe what
          has happened; whether that predicts anything is your call.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Found something that looks wrong? It might be. See{" "}
          <Link href="/" className="underline underline-offset-4">
            the dashboard
          </Link>{" "}
          for the freshness indicator, and treat any single surprising number with suspicion.
        </p>
      </Section>
    </div>
  );
}
