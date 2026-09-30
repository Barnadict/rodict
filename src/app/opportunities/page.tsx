import Link from "next/link";
import { cacheLife } from "next/cache";
import { Suspense } from "react";

import { getAllGenres } from "@/lib/db/genres";
import { getAllThemes, getThemeGameRows } from "@/lib/db/themes";
import {
  getAnalyticsComputedAt,
  getOpportunityAll,
  getOpportunityRanking,
} from "@/lib/db/analytics";
import { getConcentrationIndex, getEngagement, getGrowthRanking } from "@/lib/cached-queries";
import { concentrationLevel, hhiPoints } from "@/lib/concentration";
import { formatSessionMinutes } from "@/lib/engagement";
import { formatCompact, formatExact } from "@/lib/format";
import {
  CONCENTRATION_OPTIONS,
  CROWD_OPTIONS,
  DEFAULT_FILTERS,
  DEFAULT_WEIGHTS,
  FAST_GROWTH,
  FILTER_PARAMS,
  GROWTH_OPTIONS,
  SESSION_BANDS,
  SESSION_OPTIONS,
  SIZE_OPTIONS,
  SORT_OPTIONS,
  THEME_MIN_GAMES,
  applyFilters,
  parseFilters,
  reasons,
  scoreRows,
  sortRows,
  themeRows,
  type NicheFilters,
  type NicheKind,
  type NicheRow,
  type ScoreWeights,
} from "@/lib/niche-finder";

import { Badge } from "@/components/ui/badge";
import { PresetLinks } from "@/components/filters/preset-links";
import { GrowthBadge } from "@/components/data-table/growth-badge";
import { SectionSkeleton } from "@/components/data-table/section-skeleton";
import { GenreDot } from "@/components/genre-badge";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Niche finder — rodict" };

/**
 * Every genre's and theme's figures, scored (Task #111). One entry for all
 * filter combinations: filtering and sorting ~50 rows happens per request.
 * Reads only stored analytics and shared cached loaders, except the theme
 * pairs (one join over GameTheme, a few rows per themed game).
 */
async function getNicheData() {
  // Remote (Task #98): a single key, so a cold instance reuses another's entry.
  "use cache: remote";
  cacheLife("hours");

  const [genres, themes, opportunity, ranking, concentration, engagement, pairs, growth, at] =
    await Promise.all([
      getAllGenres(),
      getAllThemes(),
      getOpportunityAll(),
      getOpportunityRanking(),
      getConcentrationIndex(),
      getEngagement(),
      getThemeGameRows(),
      getGrowthRanking("7d"),
      getAnalyticsComputedAt(),
    ]);

  const weights: ScoreWeights = { ...DEFAULT_WEIGHTS, ...ranking?.weights };
  const hhiByGenre = new Map(concentration.map(([id, c]) => [id, c.days.at(-1)?.hhi ?? null]));
  const sessionByGenre = new Map(engagement.genres.map((g) => [g.genreId, g.sessionMinutes]));

  // Genres: the stored opportunity score and components (analytics/opportunity.py).
  const genreRows: NicheRow[] = genres.flatMap((g) => {
    const o = opportunity.get(g.id);
    if (!o || o.components.gameCount === 0) return [];
    return [
      {
        kind: "genre" as const,
        id: g.id,
        slug: g.slug,
        name: g.name,
        totalPlaying: o.components.totalPlaying,
        gameCount: o.components.gameCount,
        playersPerGame: o.components.playersPerGame,
        growth7d: o.components.growth7d,
        hhi: hhiByGenre.get(g.id) ?? null,
        sessionMinutes: sessionByGenre.get(g.id) ?? null,
        score: o.score,
      },
    ];
  });

  // Themes: worked out from their games, scored the same way among themes.
  const growthByGame = new Map(
    growth.flatMap((r) =>
      r.growthPct === null
        ? []
        : [[r.id, { basePlaying: r.basePlaying, currentPlaying: r.currentPlaying }]],
    ),
  );
  const themeList = scoreRows(
    themeRows(
      themes,
      pairs.map((p) => ({ themeId: p.themeId, gameId: p.gameId, playing: p.playing })),
      new Map(engagement.games.map((g) => [g.id, g.minutes])),
      growthByGame,
    ),
    weights,
  );

  return { genres: genreRows, themes: themeList, weights, analyticsAt: at };
}

export default function OpportunitiesPage(props: PageProps<"/opportunities">) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Niche finder"
        description="Set the kind of market you're looking for and see which genres and themes match, ranked, with what puts each one there. It describes the data; it doesn't say what to build."
      />
      <Suspense
        fallback={
          <>
            <SectionSkeleton className="h-40" />
            <SectionSkeleton title="Genres" className="h-96" />
          </>
        }
      >
        <NicheResults searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

const CONTROLS: {
  key: keyof NicheFilters;
  label: string;
  options: readonly { value: string; label: string }[];
  hint: string;
}[] = [
  {
    key: "size",
    label: "Size",
    options: SIZE_OPTIONS,
    hint: "Players now: the smallest, middle or largest third of genres (or themes).",
  },
  {
    key: "crowd",
    label: "How crowded",
    options: CROWD_OPTIONS,
    hint: "Number of tracked games: the fewest, middle or most third.",
  },
  {
    key: "growth",
    label: "Growth",
    options: GROWTH_OPTIONS,
    hint: `Change in players over 7 days; "+10%+" is at least ${FAST_GROWTH * 100}%.`,
  },
  {
    key: "concentration",
    label: "Concentration",
    options: CONCENTRATION_OPTIONS,
    hint: "How much of the players the biggest games hold (HHI bands).",
  },
  {
    key: "session",
    label: "Est. session",
    options: SESSION_OPTIONS,
    hint: `Est. minutes per visit: under ${SESSION_BANDS.short}, ${SESSION_BANDS.short}–${SESSION_BANDS.long}, or ${SESSION_BANDS.long}+.`,
  },
  { key: "sort", label: "Rank by", options: SORT_OPTIONS, hint: "" },
];

async function NicheResults({
  searchParams,
}: {
  searchParams: PageProps<"/opportunities">["searchParams"];
}) {
  const sp = await searchParams;
  const filters = parseFilters((param) => {
    const v = sp[param];
    return Array.isArray(v) ? v[0] : v;
  });
  const { genres, themes, weights, analyticsAt } = await getNicheData();

  // Every other set filter, so changing one control keeps the rest.
  const paramsExcept = (key: keyof NicheFilters) =>
    Object.fromEntries(
      (Object.keys(FILTER_PARAMS) as (keyof NicheFilters)[])
        .filter((k) => k !== key && filters[k] !== DEFAULT_FILTERS[k])
        .map((k) => [FILTER_PARAMS[k], filters[k]]),
    );
  const anySet = (Object.keys(DEFAULT_FILTERS) as (keyof NicheFilters)[]).some(
    (k) => k !== "sort" && filters[k] !== DEFAULT_FILTERS[k],
  );

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        {CONTROLS.map((c) => (
          <div key={c.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="w-32 shrink-0 text-sm font-medium">{c.label}</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="max-w-full overflow-x-auto">
                <PresetLinks
                  param={FILTER_PARAMS[c.key]}
                  options={c.options}
                  current={filters[c.key]}
                  clearValue={DEFAULT_FILTERS[c.key]}
                  baseParams={paramsExcept(c.key)}
                />
              </div>
              {c.hint && <span className="text-xs text-muted-foreground">{c.hint}</span>}
            </div>
          </div>
        ))}
        {anySet && (
          <Link href="/opportunities" className="self-start text-sm underline underline-offset-2">
            Clear all constraints
          </Link>
        )}
      </div>

      <NicheSection kind="genre" pool={genres} filters={filters} weights={weights} />
      <NicheSection kind="theme" pool={themes} filters={filters} weights={weights} />

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">How it ranks.</span> The score (0–100) is
          the{" "}
          <Link href="/saturation" className="underline underline-offset-2">
            opportunity score
          </Link>
          : players per game ({Math.round(weights.intensity * 100)}%), total players (
          {Math.round(weights.demand * 100)}%) and 7-day growth ({Math.round(weights.growth * 100)}
          %), minus crowding ({Math.round(Math.abs(weights.supply) * 100)}%), each scaled across the
          list. Genres&apos; scores come from the analytics run
          {analyticsAt && (
            <>
              {" "}
              (<LocalTime value={analyticsAt} />)
            </>
          )}
          ; themes are scored the same way among themes only, so a genre&apos;s score and a
          theme&apos;s can&apos;t be compared. Size and crowding are thirds of the unfiltered list.
          The reasons list the parts of the score where it sits above the middle, biggest weight
          first.
        </p>
        <p>
          <span className="font-medium text-foreground">Estimated and derived inputs.</span> The
          score is derived, and session length is an estimate (see{" "}
          <Link href="/about#forecasts" className="underline underline-offset-2">
            About
          </Link>
          ). Genre growth is the change in the genre&apos;s total players over 7 days; theme growth
          is the combined change of its games&apos; first- and last-day averages over 7 days (games
          busy enough to be ranked on Trending; at least {THEME_MIN_GAMES.growth}). Genre
          concentration is the latest day&apos;s HHI from daily averages; a theme&apos;s is from
          players now (at least {THEME_MIN_GAMES.concentration} games with players). A theme&apos;s
          session length pools its games&apos; estimates by players (at least{" "}
          {THEME_MIN_GAMES.session}). A figure without enough data shows &ldquo;—&rdquo;, and a
          constraint on it leaves that row out. All counts are tracked games only, not all of
          Roblox.
        </p>
      </div>
    </>
  );
}

const KIND_TITLE: Record<NicheKind, string> = { genre: "Genres", theme: "Themes" };

function NicheSection({
  kind,
  pool,
  filters,
  weights,
}: {
  kind: NicheKind;
  pool: NicheRow[];
  filters: NicheFilters;
  weights: ScoreWeights;
}) {
  const rows = sortRows(applyFilters(pool, filters), filters.sort);
  const plural = KIND_TITLE[kind].toLowerCase();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">
        {KIND_TITLE[kind]}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          {`${formatExact(rows.length)} of ${formatExact(pool.length)} match`}
        </span>
      </h2>
      {pool.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {kind === "genre"
            ? "No genre scores yet: they appear after the analytics jobs run."
            : "No themed games tracked yet."}
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {`No ${plural} meet every constraint. Try loosening one.`}
        </p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border">
          {rows.map((r, i) => (
            <NicheItem key={r.id} row={r} rank={i + 1} pool={pool} weights={weights} />
          ))}
        </ol>
      )}
    </section>
  );
}

function NicheItem({
  row: r,
  rank,
  pool,
  weights,
}: {
  row: NicheRow;
  rank: number;
  pool: NicheRow[];
  weights: ScoreWeights;
}) {
  const href = r.kind === "genre" ? `/genres/${r.slug}` : `/themes/${r.slug}`;
  const stats: { label: React.ReactNode; value: React.ReactNode }[] = [
    { label: "Players", value: formatCompact(r.totalPlaying) },
    { label: "Games", value: formatExact(r.gameCount) },
    { label: "Players / game", value: formatCompact(Math.round(r.playersPerGame)) },
    { label: "7-day growth", value: <GrowthBadge growth={r.growth7d} /> },
    {
      label: "Concentration",
      value:
        r.hhi === null
          ? "—"
          : `${concentrationLevel(r.hhi)} (HHI ${formatExact(hhiPoints(r.hhi))})`,
    },
    {
      label: (
        <>
          Session <Badge variant="secondary">Est.</Badge>
        </>
      ),
      value: formatSessionMinutes(r.sessionMinutes),
    },
  ];

  return (
    <li className="flex items-start gap-3 p-3">
      <span className="w-6 shrink-0 pt-0.5 text-right text-sm text-muted-foreground tabular-nums">
        {rank}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={href} className="inline-flex items-center gap-2 font-medium hover:underline">
            {r.kind === "genre" && <GenreDot genre={r.slug} />}
            {r.name}
          </Link>
          <span className="flex items-center gap-1.5 text-sm tabular-nums">
            <span className="text-muted-foreground">Score</span>
            <span className="font-medium">{r.score === null ? "—" : r.score.toFixed(1)}</span>
            <Badge variant="outline">Derived</Badge>
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s, i) => (
            <div key={i} className="flex flex-col">
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">{s.label}</dt>
              <dd className="tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {reasons(r, pool, weights).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}
