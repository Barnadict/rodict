import { cacheLife } from "next/cache";

import { buildSearchIndex } from "@/lib/db/search";

async function getSearchIndex() {
  "use cache";
  cacheLife("hours");
  return buildSearchIndex();
}

/**
 * The ⌘K palette's search index (Task #70): every game, genre, theme and
 * creator name in one cached response, matched in the browser so typing costs
 * no database reads.
 */
export async function GET() {
  return Response.json(await getSearchIndex(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
