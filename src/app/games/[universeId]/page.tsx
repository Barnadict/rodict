import Image from "next/image";
import { notFound } from "next/navigation";

import { getGameByUniverseId, getGameSnapshots } from "@/lib/db/games";
import { getGameIcons } from "@/lib/roblox/client";
import { deriveSnapshotMetrics } from "@/lib/earnings/estimate";
import { formatCompact, formatExact, formatUsdRange } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { PresetLinks } from "@/components/filters/preset-links";
import { TrendChart, type TrendPoint } from "@/components/charts/trend-chart";
import { StatTile } from "@/components/data-table/stat-tile";
import { RANGE_OPTIONS, RANGE_CLEAR_VALUE, parseRangeKey, rangeToCutoff } from "@/lib/date-range";

export default async function GameDetailPage(props: PageProps<"/games/[universeId]">) {
  const { universeId: universeIdParam } = await props.params;
  const sp = await props.searchParams;
  const range = parseRangeKey(Array.isArray(sp.range) ? sp.range[0] : sp.range);

  let universeId: bigint;
  try {
    universeId = BigInt(universeIdParam);
  } catch {
    notFound();
  }

  const game = await getGameByUniverseId(universeId);
  if (!game) notFound();
  const from = rangeToCutoff(range);

  const [snapshots, icons] = await Promise.all([
    getGameSnapshots(game.id, { from }),
    getGameIcons([universeId]),
  ]);

  const iconUrl = icons[0]?.imageUrl ?? null;
  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : undefined;
  const derived = latest ? deriveSnapshotMetrics(latest, previous) : null;

  const chartData: TrendPoint[] = snapshots.map((s) => ({
    date: s.collectedAt.toISOString(),
    value: s.playing,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start gap-4">
        {iconUrl ? (
          <Image
            src={iconUrl}
            alt=""
            width={64}
            height={64}
            className="rounded-lg border"
            unoptimized
          />
        ) : (
          <div className="size-16 rounded-lg border bg-muted" />
        )}
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{game.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            {game.currentGenre && <Badge variant="secondary">{game.currentGenre.name}</Badge>}
            {game.themes.map((t) => (
              <Badge key={t.themeId} variant="outline">
                {t.theme.name}
              </Badge>
            ))}
            {game.status === "dead" && <Badge variant="destructive">Dead</Badge>}
          </div>
          {game.creatorName && (
            <p className="text-sm text-muted-foreground">by {game.creatorName}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Players now" value={formatCompact(game.currentPlaying)} />
        <StatTile label="All-time peak" value={formatCompact(game.allTimePeakPlayers)} />
        <StatTile label="Total visits" value={formatCompact(game.currentVisits)} />
        <StatTile label="Favorites" value={formatCompact(game.currentFavorites)} />
        <StatTile
          label="Like ratio"
          value={
            derived?.likeRatio !== null && derived?.likeRatio !== undefined
              ? `${Math.round(derived.likeRatio * 100)}%`
              : "—"
          }
        />
        <StatTile
          label="Est. earnings/day"
          value={
            derived
              ? formatUsdRange(
                  derived.estimatedDailyEarnings.low,
                  derived.estimatedDailyEarnings.high,
                )
              : "—"
          }
          badge="Est."
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
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
            data={chartData}
            unit="players"
            emptyMessage="No snapshots in this range yet."
          />
        </div>
        {snapshots.length > 0 && (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              View as table
            </summary>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Collected at (UTC)</th>
                    <th className="px-3 py-1.5 text-right font-medium">Players</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snapshots].reverse().map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-1.5">{s.collectedAt.toISOString()}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {formatExact(s.playing)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
