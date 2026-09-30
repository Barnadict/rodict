import Link from "next/link";
import { cacheLife } from "next/cache";

import { getMarketSeries } from "@/lib/db/market";
import { GENRE_CARRY_MAX_AGE_HOURS } from "@/lib/db/genre-snapshots";
import { COLLECTION_GAP_LABEL } from "@/lib/chart-time";
import { LOW_COVERAGE } from "@/lib/stats";
import { formatCompact } from "@/lib/format";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";
import { pageMetadata } from "@/lib/site";

import { PageHeader } from "@/components/page-header";
import { PresetLinks } from "@/components/filters/preset-links";
import { StatTile } from "@/components/data-table/stat-tile";
import { LocalTime } from "@/components/local-time";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";

export const metadata = pageMetadata({
  title: "Market overview — rodict",
  description:
    "Total concurrent players across every game rodict tracks, over time. Tracked games only, not all of Roblox.",
  path: "/market",
});

/** Keyed on the range key, not a cutoff Date, so the cache can hit (see /trending). */
async function getMarketData(range: RangeKey) {
  // Remote (Task #98): four distinct keys, so a cold instance reuses another's entry.
  "use cache: remote";
  cacheLife("hours");

  const series = await getMarketSeries(rangeToCutoff(range));
  const latest = series.at(-1) ?? null;
  const peak = series.reduce<(typeof series)[number] | null>(
    (best, p) => (!best || p.totalPlaying > best.totalPlaying ? p : best),
    null,
  );
  return { series, latest, peak };
}

export default async function MarketPage(props: PageProps<"/market">) {
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const { series, latest, peak } = await getMarketData(range);

  const trendData: TrendPoint[] = series.map((p) => ({
    date: p.date,
    value: p.totalPlaying,
    coverage: p.coverage,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Market overview"
        description="Total players across every tracked game with a genre, over time. This counts the games rodict tracks, not all of Roblox."
      />

      {latest && peak && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Players, latest run" value={formatCompact(latest.totalPlaying)} />
          <StatTile label="Peak in range" value={formatCompact(peak.totalPlaying)} />
          <StatTile label="Games in latest run" value={formatCompact(latest.totalGames)} />
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Players over time</h2>
          <PresetLinks
            param="range"
            options={RANGE_OPTIONS}
            current={range}
            clearValue={RANGE_CLEAR_VALUE}
          />
        </div>
        <div className="rounded-lg border p-4">
          <TrendChart
            data={trendData}
            unit="players"
            movingAverageWindow={8}
            height={340}
            emptyMessage="No collection runs in this range yet."
            ariaLabel="Line chart of total concurrent players across tracked games over time"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Each point adds up every genre&apos;s players at one collection run (about every 3h), so
          it covers tracked games that have a genre; unclassified games aren&apos;t in it. Quiet
          games are collected about once a day, and their latest reading is carried forward for up
          to {GENRE_CARRY_MAX_AGE_HOURS}h. The tooltip shows the share of games a point includes,
          and hollow markers flag points below {Math.round(LOW_COVERAGE * 100)}%. The grey line is
          an 8-run (about one day) average. &ldquo;{COLLECTION_GAP_LABEL}&rdquo; marks Aug 20 – Sep
          29, 2026, when collection was paused: that span is missing, not zero.
        </p>
        <p className="text-xs text-muted-foreground">
          The total rises when rodict starts tracking more games, not only when more people play.
          For a genre&apos;s own line, open it from{" "}
          <Link href="/genres" className="underline underline-offset-2 hover:text-foreground">
            Genres
          </Link>
          .
          {peak && (
            <>
              {" "}
              Peak in this range: <LocalTime value={new Date(peak.date)} />.
            </>
          )}
        </p>
      </section>
    </div>
  );
}
