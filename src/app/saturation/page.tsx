import Link from "next/link";
import { cacheLife } from "next/cache";

import { getGenreStats } from "@/lib/db/genre-stats";
import { getOpportunityRanking, getAnalyticsComputedAt } from "@/lib/db/analytics";
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
  const [stats, opportunity, analyticsAt] = await Promise.all([
    getGenreStats({ asOf }),
    getOpportunityRanking(),
    getAnalyticsComputedAt(),
  ]);

  return { stats, opportunity, analyticsAt, asOf };
}

export default async function SaturationPage(props: PageProps<"/saturation">) {
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  const { stats, opportunity, analyticsAt, asOf } = await getSaturationData(range);

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
            {analyticsAt &&
              ` Last computed ${analyticsAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`}
          </>
        ) : (
          <>
            Run the analytics jobs (<span className="font-mono">npm run analytics</span>) to add the
            composite opportunity score.
          </>
        )}
      </p>
    </div>
  );
}
