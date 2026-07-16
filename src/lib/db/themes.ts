import { prisma } from "@/lib/prisma";

export function getAllThemes() {
  return prisma.theme.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

/** slug -> id, for turning resolved taxonomy slugs into DB foreign keys. */
export async function getThemeIdMap(): Promise<Map<string, string>> {
  const themes = await prisma.theme.findMany({ select: { id: true, slug: true } });
  return new Map(themes.map((t) => [t.slug, t.id]));
}
