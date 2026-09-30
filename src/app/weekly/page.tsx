import Link from "next/link";
import type { ReactNode } from "react";
import { Rss } from "lucide-react";

import { getWeeklyRecap } from "@/lib/cached-queries";
import { RISING } from "@/lib/db/trends";
import { formatCompact } from "@/lib/format";
import { formatGrowthPct } from "@/lib/stats";
import { pageMetadata } from "@/lib/site";
import { WEEKLY_DAYS, isoWeek } from "@/lib/weekly";

import { Badge } from "@/components/ui/badge";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { StatTile } from "@/components/data-table/stat-tile";
import { LocalTime } from "@/components/local-time";

export const metadata = {
  ...pageMetadata({
    title: "Weekly recap — rodict",
    description:
      "The last 7 days on Roblox: top rising games and genres, the biggest spikes, new entrants and games that went dead.",
    path: "/weekly",
  }),
  alternates: {
    canonical: "/weekly",
    types: { "application/atom+xml": "/weekly/feed" },
  },
};

export default async function WeeklyPage() {
  const { data, now } = await getWeeklyRecap();
  const { risingGames, risingGenres, spikes, entrants, deaths } = data;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly recap</h1>
          <p className="text-muted-foreground">
            The last {WEEKLY_DAYS} days, week {isoWeek(now).split("-W")[1]}. Built{" "}
            <LocalTime value={now} />.
          </p>
        </div>
        <a
          href="/weekly/feed"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Rss className="size-4 text-orange-500" aria-hidden="true" />
          Atom feed
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Rising games" value={risingGames.length} hint="top by 7-day growth" />
        <StatTile label="Biggest spikes" value={spikes.length} hint="flagged this week" />
        <StatTile label="New entrants" value={formatCompact(entrants.total)} />
        <StatTile label="Went dead" value={formatCompact(deaths.total)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecapList
          title="Top rising games"
          href="/trending?range=7d"
          empty="Nothing grew this week, or there isn't a week of history yet."
          rows={risingGames.map((g) => ({
            key: g.universeId,
            name: (
              <Link href={`/games/${g.universeId}`} className="hover:underline">
                {g.name}
              </Link>
            ),
            tag: g.genreName,
            value: (
              <>
                <span className="text-muted-foreground">
                  {formatCompact(Math.round(g.basePlaying))} →
                </span>{" "}
                {formatCompact(Math.round(g.currentPlaying))} <GrowthBadge growth={g.growthPct} />
              </>
            ),
          }))}
        />
        <RecapList
          title="Top rising genres"
          href="/trending?range=7d"
          empty="No genre grew this week."
          rows={risingGenres.map((g) => ({
            key: g.slug,
            name: (
              <Link href={`/genres/${g.slug}`} className="hover:underline">
                {g.name}
              </Link>
            ),
            value: (
              <>
                <span className="text-muted-foreground">
                  {formatCompact(Math.round(g.basePlaying))} →
                </span>{" "}
                {formatCompact(Math.round(g.currentPlaying))} <GrowthBadge growth={g.growthPct} />
              </>
            ),
          }))}
        />
        <RecapList
          title="Biggest spikes"
          href="/trending"
          empty="No spikes were flagged this week."
          rows={spikes.map((a, i) => ({
            key: `${a.scope}-${a.id}-${a.at}-${i}`,
            name: a.universeId ? (
              <Link href={`/games/${a.universeId}`} className="hover:underline">
                {a.name}
              </Link>
            ) : (
              a.name
            ),
            tag: a.scope === "genre" ? "genre" : null,
            value: (
              <>
                <span className="text-muted-foreground">
                  {formatCompact(a.prevValue)} → {formatCompact(a.value)}
                </span>{" "}
                <Badge variant="secondary">▲ {formatGrowthPct(a.changePct)}</Badge>
              </>
            ),
          }))}
        />
        <RecapList
          title="New entrants"
          href="/new"
          total={entrants.total}
          empty="No new games were found this week."
          rows={entrants.games.map((g) => ({
            key: g.universeId,
            name: (
              <Link href={`/games/${g.universeId}`} className="hover:underline">
                {g.name}
              </Link>
            ),
            tag: g.newOnRoblox ? "new on Roblox" : "newly tracked",
            value: `${formatCompact(g.currentPlaying)} playing`,
          }))}
        />
        <RecapList
          title="Went dead"
          href="/graveyard"
          total={deaths.total}
          empty="No game went dead this week."
          rows={deaths.games.map((g) => ({
            key: g.universeId,
            name: (
              <Link href={`/games/${g.universeId}`} className="hover:underline">
                {g.name}
              </Link>
            ),
            tag: g.genreName,
            value: `peak ${formatCompact(g.allTimePeakPlayers)}`,
          }))}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Rising uses the /trending rule over {WEEKLY_DAYS} days: average players over the first{" "}
        {RISING.avgWindowHours}h vs. the last {RISING.avgWindowHours}h, from a start of at least{" "}
        {RISING.minBaseline}. Spikes are the automatically flagged jumps between two collections.
        New entrants were created on Roblox or first tracked this week; &ldquo;went dead&rdquo; uses
        the rule on the{" "}
        <Link href="/about" className="underline underline-offset-4">
          about page
        </Link>
        . The feed adds one entry a week.
      </p>
    </div>
  );
}

function RecapList({
  title,
  href,
  rows,
  empty,
  total,
}: {
  title: string;
  href: string;
  rows: { key: string; name: ReactNode; tag?: string | null; value: ReactNode }[];
  empty: string;
  total?: number;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        <Link href={href} className="text-sm text-muted-foreground hover:underline">
          {total !== undefined && total > rows.length ? `All ${formatCompact(total)} →` : "More →"}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="truncate font-medium">{r.name}</span>
                {r.tag && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {r.tag}
                  </Badge>
                )}
              </span>
              <span className="shrink-0 text-right tabular-nums">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
