import { prisma } from "@/lib/prisma";

/** All active genres, in display order. */
export function getAllGenres() {
  return prisma.genre.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function getGenreBySlug(slug: string) {
  return prisma.genre.findUnique({ where: { slug } });
}

/** slug -> id, for turning resolved taxonomy slugs into DB foreign keys. */
export async function getGenreIdMap(): Promise<Map<string, string>> {
  const genres = await prisma.genre.findMany({ select: { id: true, slug: true } });
  return new Map(genres.map((g) => [g.slug, g.id]));
}
