/**
 * Cross-cutting THEMES — the setting/aesthetic of a game, tracked separately
 * from its gameplay genre (locked decision). A game can have several themes.
 *
 * Example: "Anime Fighting Simulator" -> genre = Simulator, themes = [Anime].
 *
 * Extensible: add an entry and re-run the seed. Keep these about
 * setting/flavor (Anime, Fantasy, Medieval…), NOT gameplay — gameplay lives
 * in genres.ts.
 */

export const THEME_SLUGS = [
  "anime",
  "fantasy",
  "sci-fi",
  "medieval",
  "military",
  "superhero",
  "pirate",
  "zombie",
  "ninja",
  "western",
  "space",
  "school",
  "animals",
  "vehicles",
] as const;

export type ThemeSlug = (typeof THEME_SLUGS)[number];

export interface ThemeDef {
  slug: ThemeSlug;
  name: string;
}

export const THEMES: readonly ThemeDef[] = [
  { slug: "anime", name: "Anime" },
  { slug: "fantasy", name: "Fantasy" },
  { slug: "sci-fi", name: "Sci-Fi" },
  { slug: "medieval", name: "Medieval" },
  { slug: "military", name: "Military & War" },
  { slug: "superhero", name: "Superhero" },
  { slug: "pirate", name: "Pirate" },
  { slug: "zombie", name: "Zombie" },
  { slug: "ninja", name: "Ninja" },
  { slug: "western", name: "Western" },
  { slug: "space", name: "Space" },
  { slug: "school", name: "School" },
  { slug: "animals", name: "Animals & Pets" },
  { slug: "vehicles", name: "Cars & Vehicles" },
];
