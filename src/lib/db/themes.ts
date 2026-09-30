import { prisma } from "@/lib/prisma";
import type { ThemeGameRow } from "@/lib/theme-matrix";

export function getAllThemes() {
  return prisma.theme.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

export function getThemeBySlug(slug: string) {
  return prisma.theme.findUnique({ where: { slug } });
}

/** slug -> id, for turning resolved taxonomy slugs into DB foreign keys. */
export async function getThemeIdMap(): Promise<Map<string, string>> {
  const themes = await prisma.theme.findMany({ select: { id: true, slug: true } });
  return new Map(themes.map((t) => [t.slug, t.id]));
}

/**
 * One row per (game, theme) pair with the game's current genre and metrics —
 * the input to every theme rollup and the genre × theme matrix (Task #64). A
 * single join over GameTheme (a few rows per themed game), grouped in memory by
 * src/lib/theme-matrix.ts. Pass `themeId` to read one theme's pairs only (the
 * GameTheme themeId index).
 */
export async function getThemeGameRows(themeId?: string): Promise<ThemeGameRow[]> {
  const rows = await prisma.gameTheme.findMany({
    where: themeId ? { themeId } : undefined,
    select: {
      gameId: true,
      themeId: true,
      game: { select: { currentGenreId: true, currentPlaying: true, currentVisits: true } },
    },
  });
  return rows.map((r) => ({
    gameId: r.gameId,
    themeId: r.themeId,
    genreId: r.game.currentGenreId,
    playing: r.game.currentPlaying,
    visits: r.game.currentVisits,
  }));
}
