import Link from "next/link";

import { EARNINGS_ASSUMPTIONS } from "@/lib/earnings/estimate";
import { DEVEX_SCHEDULES } from "@/lib/earnings/devex";
import { DEFAULT_RETENTION_POLICY } from "@/lib/retention/policy";
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
 * would. (The DevEx schedule, earnings assumptions, retention policy, and genre
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
          scheduled job runs <strong>every 3 hours</strong>, fetches each tracked game, and writes
          one timestamped row per game. History therefore only exists from the day collection
          started, and it cannot be backfilled.
        </p>
        <ul className="max-w-2xl list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">
              Games are followed until they die, not dropped.
            </strong>{" "}
            Every game already in the database is re-collected on every run, in addition to newly
            discovered ones. This is deliberate: if we only ever tracked whatever is popular today,
            games that failed would silently vanish from the dataset and every lifespan and survival
            statistic would be wrong — a mistake known as <em>survivorship bias</em>.
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
            scheduled Python jobs after each successful collection, then stored. Nothing statistical
            is computed while you load a page.
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
                  continues — it cannot anticipate an update, a viral moment, or a shutdown. Always
                  shown with its band.
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
                  mid-life are left-truncated. Needs games followed to death to mean anything.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Notable changes (spikes / drops)</TableCell>
                <TableCell className="text-muted-foreground">
                  A step is flagged only if it is both statistically unusual for that game&apos;s
                  own curve (robust z-score using median/MAD) <em>and</em> large in absolute terms.
                  Both bars are required — judged on unusualness alone, an ordinary wiggle on a very
                  steady curve scores as an extreme outlier.
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
          Snapshots accumulate forever, so older data is thinned to stay within a free-tier
          database. Within each period the most recent snapshot is kept, and a game&apos;s all-time
          peak is stored separately — so thinning never breaks the dead rule.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Age of data</TableHead>
                <TableHead>Resolution kept</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium tabular-nums">
                  Up to {DEFAULT_RETENTION_POLICY.hourlyDays} days
                </TableCell>
                <TableCell className="text-muted-foreground">
                  Everything — full collection resolution
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium tabular-nums">
                  {DEFAULT_RETENTION_POLICY.hourlyDays}–{DEFAULT_RETENTION_POLICY.dailyDays} days
                </TableCell>
                <TableCell className="text-muted-foreground">One snapshot per day</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium tabular-nums">
                  Over {DEFAULT_RETENTION_POLICY.dailyDays} days
                </TableCell>
                <TableCell className="text-muted-foreground">One snapshot per week</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
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
