import Link from "next/link";

import { getGenreStats } from "@/lib/db/genre-stats";
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
import { RANGE_OPTIONS, RANGE_CLEAR_VALUE, parseRangeKey, rangeToCutoff } from "@/lib/date-range";

export const metadata = { title: "Saturation — rodict" };

// Reads live DB aggregates; render per request rather than snapshotting at build.
// (Caching/revalidation is tuned in Task #39.)
export const dynamic = "force-dynamic";

export default async function SaturationPage(props: PageProps<"/saturation">) {
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const asOf = rangeToCutoff(range);

  const stats = await getGenreStats({ asOf });

  const points: SaturationPoint[] = stats
    .filter((s) => s.genreId && s.gameCount > 0)
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      games: s.gameCount,
      totalPlaying: s.totalPlaying,
      playersPerGame: s.totalPlaying / s.gameCount,
    }))
    .sort((a, b) => b.playersPerGame - a.playersPerGame);

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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <p className="text-sm text-muted-foreground">
        This is the basic descriptive view. A composite opportunity/saturation score comes in the
        analytics phase (Task #24).
      </p>
    </div>
  );
}
