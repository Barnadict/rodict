import type { NextRequest } from "next/server";

import type { GameSortField } from "@/lib/db/games";
import { parseRangeKey } from "@/lib/date-range";
import { exportFileName, parseExportFormat, toCsv, toJson, type ExportTable } from "@/lib/export";
import { getGamesExport, getSnapshotsExport, getTrendingExport } from "@/lib/export-data";
import { parseAge, parseMinPlayers, parseStatus } from "@/lib/games-list";

const SORTS: GameSortField[] = [
  "currentPlaying",
  "currentVisits",
  "currentFavorites",
  "allTimePeakPlayers",
  "firstSeenAt",
  "likeRatio",
  "growth",
];

const usage = (message: string) =>
  new Response(message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/**
 * CSV/JSON export of the site's tables (Task #71):
 *   /api/export/games?genre=&theme=&status=&age=&min=&q=&sort=&order=&range=
 *   /api/export/trending?kind=games|genres&range=
 *   /api/export/snapshots?game=<universe id>&range=
 * each with `format=csv` (default) or `format=json`.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[dataset]">) {
  const { dataset } = await ctx.params;
  const p = request.nextUrl.searchParams;
  const get = (key: string) => p.get(key) ?? undefined;
  const format = parseExportFormat(p.get("format"));
  const range = parseRangeKey(get("range"));

  let table: ExportTable | null;
  if (dataset === "games") {
    const sort = get("sort");
    table = await getGamesExport({
      genreSlug: get("genre"),
      themeSlug: get("theme"),
      status: parseStatus(get("status")),
      age: parseAge(get("age")),
      minPlaying: parseMinPlayers(get("min")),
      search: get("q")?.slice(0, 100),
      sort: SORTS.includes(sort as GameSortField) ? (sort as GameSortField) : "currentPlaying",
      order: get("order") === "asc" ? "asc" : "desc",
      range,
    });
  } else if (dataset === "trending") {
    const kind = get("kind");
    if (kind !== "games" && kind !== "genres") return usage("Add ?kind=games or ?kind=genres.");
    table = await getTrendingExport(kind, range);
  } else if (dataset === "snapshots") {
    const game = get("game");
    if (!game) return usage("Add ?game=<universe id>.");
    table = await getSnapshotsExport(game, range);
    if (!table) return new Response("Unknown game.", { status: 404 });
  } else {
    return new Response("Unknown dataset. Use games, trending or snapshots.", { status: 404 });
  }

  const now = new Date();
  return new Response(format === "json" ? toJson(table, now) : toCsv(table), {
    headers: {
      "Content-Type":
        format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(table.dataset, format, now)}"`,
      "Cache-Control": "public, max-age=900",
    },
  });
}
