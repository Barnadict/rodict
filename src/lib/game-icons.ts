import { cacheLife } from "next/cache";

import { getTopUniverseIds } from "@/lib/db/games";
import { ICON_SIZE, getGameIcons } from "@/lib/roblox/client";

/** Game pages prerendered at deploy, busiest first (Task #96). */
export const PRERENDER_GAMES = 200;

/** Universe ids of the games whose pages are prerendered. */
export async function getPrerenderUniverseIds(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  return (await getTopUniverseIds(PRERENDER_GAMES)).map(String);
}

/**
 * Small icons for the prerendered games, in two batched Roblox calls. Building
 * 200 game pages would otherwise make 200 icon calls, and at runtime one
 * instance serves every popular page's icons from this one entry.
 */
async function getTopGameIcons(): Promise<Record<string, string | null>> {
  "use cache";
  cacheLife("hours");
  try {
    const ids = await getPrerenderUniverseIds();
    const icons = await getGameIcons(ids.map(BigInt), { size: ICON_SIZE.small });
    return Object.fromEntries(icons.map((i) => [String(i.universeId), i.imageUrl]));
  } catch {
    return {}; // pages still render without icons
  }
}

/**
 * Small icon URLs by universe id (as a string). Popular games come from the
 * shared batch above; the rest cost one Roblox call together.
 */
export async function getSmallIcons(
  universeIds: (bigint | string)[],
): Promise<Map<string, string | null>> {
  const top = await getTopGameIcons();
  const ids = universeIds.map(String);
  const missing = ids.filter((id) => !(id in top));
  const fetched = missing.length
    ? await getGameIcons(missing.map(BigInt), { size: ICON_SIZE.small }).catch(() => [])
    : [];
  const out = new Map<string, string | null>(
    fetched.map((i) => [String(i.universeId), i.imageUrl]),
  );
  for (const id of ids) if (id in top) out.set(id, top[id]);
  return out;
}

/**
 * Small icons for a list that's picked per request (a filter or sort outside
 * the page's cached loader), cached on the id list so repeat views of the same
 * list don't call Roblox again. Returns a plain object so it can be cached.
 */
export async function getListIcons(universeIds: string[]): Promise<Record<string, string | null>> {
  "use cache";
  cacheLife("hours");
  return Object.fromEntries(await getSmallIcons(universeIds));
}
