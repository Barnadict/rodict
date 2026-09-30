import Link from "next/link";
import { cacheLife } from "next/cache";

import { getGenreStats } from "@/lib/db/genre-stats";
import { getOpportunityRanking, getAnalyticsComputedAt } from "@/lib/db/analytics";
import { getConcentrationIndex } from "@/lib/cached-queries";
import { getAllGenres } from "@/lib/db/genres";
import {
  concentrationLevel,
  effectiveGames,
  hhiPoints,
  latestWithBaseline,
} from "@/lib/concentration";
import { formatCompact } from "@/lib/format";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SaturationScatter, type SaturationPoint } from "@/components/charts/saturation-scatter";
import { PresetLinks } from "@/components/filters/preset-links";
import { LocalTime } from "@/components/local-time";
import {
  RANGE_OPTIONS,
  RANGE_CLEAR_VALUE,
  parseRangeKey,
  rangeToCutoff,
  type RangeKey,
} from "@/lib/date-range";

export const metadata = { title: "Saturation — rodict" };

// Keyed on the range key so the cutoff is derived inside the cache — see the
// note in /trending for why passing a `now`-derived Date in would defeat it.
async function getSaturationData(range: RangeKey) {
  "use cache";
  cacheLife("hours");

  const asOf = rangeToCutoff(range);
  const [stats, opportunity, analyticsAt, concentration, genres] = await Promise.all([
    getGenreStats({ asOf }),
    getOpportunityRanking(),
    getAnalyticsComputedAt(),
    getConcentrationIndex(),
    getAllGenres(),
  ]);

  // Latest day per genre (Task #87), most concentrated first. Not range-scoped:
  // it's today's market shape, with the 30-days-earlier HHI for direction.
  const genreById = new Map(genres.map((g) => [g.id, g]));
  const concentrationRows = concentration
    .flatMap(([genreId, series]) => {
      const genre = genreById.get(genreId);
      const c = latestWithBaseline(series.days);
      return genre && c ? [{ slug: genre.slug, name: genre.name, ...c }] : [];
    })
    .sort((a, b) => b.latest.hhi - a.latest.hhi);

  return { stats, opportunity, analyticsAt, asOf, concentrationRows };
}

export default async function SaturationPage(props: PageProps<"/saturation">) {
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const { stats, opportunity, analyticsAt, asOf, concentrationRows } =
    await getSaturationData(range);

  // Precomputed opportunity score (Task #24), keyed by genre slug. It reflects
  // current data regardless of the range toggle (which scopes the scatter).
  const scoreBySlug = new Map((opportunity?.ranking ?? []).map((r) => [r.slug ?? "", r.score]));

  const points: SaturationPoint[] = stats
    .filter((s) => s.genreId && s.gameCount > 0)
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      games: s.gameCount,
      totalPlaying: s.totalPlaying,
      playersPerGame: s.totalPlaying / s.gameCount,
    }));

  // Sort by opportunity score when available; else by demand intensity.
  const hasScores = scoreBySlug.size > 0;
  points.sort((a, b) =>
    hasScores
      ? (scoreBySlug.get(b.slug) ?? -1) - (scoreBySlug.get(a.slug) ?? -1)
      : b.playersPerGame - a.playersPerGame,
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Genre saturation</h1>
        <p className="max-w-2xl text-muted-foreground">
          Supply vs. demand by genre. Genres high on the chart but far left have many players spread
          across few games — potentially under-served. Genres to the right are crowded. High
          players-per-game is a signal, not advice.
        </p>
      </div>

      <PresetLinks
        param="range"
        options={RANGE_OPTIONS}
        current={range}
        clearValue={RANGE_CLEAR_VALUE}
      />

      {points.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-muted-foreground">
          {asOf ? (
            <>
              <p>No collected history reaches back that far yet.</p>
              <p className="text-sm">
                The collector only started recently — this is expected, not a bug.
              </p>
            </>
          ) : (
            <p>No classified genres with games yet — run the collector first.</p>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-lg border p-4">
            <SaturationScatter data={points} />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Genre</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                  <TableHead className="text-right">Players / game</TableHead>
                  {hasScores && <TableHead className="text-right">Opportunity</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((p) => (
                  <TableRow key={p.slug}>
                    <TableCell className="font-medium">
                      <Link href={`/genres/${p.slug}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(p.games)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(p.totalPlaying)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(Math.round(p.playersPerGame))}
                    </TableCell>
                    {hasScores && (
                      <TableCell className="text-right tabular-nums font-medium">
                        {scoreBySlug.has(p.slug) ? scoreBySlug.get(p.slug)!.toFixed(1) : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <p className="text-sm text-muted-foreground">
        {hasScores ? (
          <>
            The <span className="font-medium text-foreground">Opportunity</span> score (0–100) is a
            precomputed composite of demand intensity, total demand, momentum, and crowding — a
            descriptive signal, not advice.
            {analyticsAt && (
              <>
                {" "}
                Last computed <LocalTime value={analyticsAt} />.
              </>
            )}
          </>
        ) : (
          <>
            Run the analytics jobs (<span className="font-mono">npm run analytics</span>) to add the
            composite opportunity score.
          </>
        )}
      </p>

      {concentrationRows.length > 0 && (
        <section id="concentration" className="flex scroll-mt-6 flex-col gap-3">
          <div>
            <h2 className="font-medium">Market concentration</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              How much of each genre&apos;s players its biggest games hold on the latest day, from
              each game&apos;s daily average players. A genre with a high HHI is a few giants: a new
              game competes with them for attention. A low one is many small games. Most
              concentrated first; the day&apos;s date is in each genre&apos;s row.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Genre</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Biggest game</TableHead>
                  <TableHead className="text-right">Top 5</TableHead>
                  <TableHead className="text-right">Top 10</TableHead>
                  <TableHead className="text-right">HHI</TableHead>
                  <TableHead className="text-right">30 days earlier</TableHead>
                  <TableHead className="text-right">Like N equal games</TableHead>
                  <TableHead>Shape</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {concentrationRows.map((r) => (
                  <TableRow key={r.slug}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/genres/${r.slug}#concentration`}
                        className="hover:underline"
                        title={`Latest day: ${r.latest.day}`}
                      >
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompact(r.latest.n)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(r.latest.top1 * 100)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(r.latest.top5 * 100)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(r.latest.top10 * 100)}%
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCompact(hhiPoints(r.latest.hhi))}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {r.baseline ? formatCompact(hhiPoints(r.baseline.hhi)) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {effectiveGames(r.latest.hhi)?.toFixed(1) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {concentrationLevel(r.latest.hhi)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            HHI (Herfindahl-Hirschman index) is the sum of every game&apos;s squared share of the
            genre&apos;s players, on a 0–10,000 scale. Under 1,500 reads as many small games and
            over 2,500 as a few giants, the usual antitrust bands, used here only as labels.
            &ldquo;Like N equal games&rdquo; is 10,000 ÷ HHI. Not affected by the range toggle.
          </p>
        </section>
      )}
    </div>
  );
}
