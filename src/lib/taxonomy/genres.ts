/**
 * rodict's OWN normalized, gameplay-based genre list.
 *
 * This is deliberately NOT Roblox's deprecated `Genre` enum (which is thematic —
 * TownAndCity, Fantasy, Ninja… — not gameplay-based). Genre drives every
 * statistic on the site, so its quality matters most. The list is extensible:
 * add an entry here and re-run the seed (`npm run db:seed`).
 *
 * Themes (Anime, Fantasy, Sci-Fi…) are tracked SEPARATELY — see themes.ts.
 */

export const GENRE_SLUGS = [
  "simulator",
  "tycoon",
  "obby",
  "rpg",
  "roleplay-life",
  "tower-defense",
  "fighting",
  "shooter",
  "horror",
  "adventure",
  "survival",
  "sports",
  "racing",
  "clicker-idle",
  "strategy",
  "minigame-party",
  "sandbox-building",
  "escape-story",
  "puzzle",
  "social-hangout",
] as const;

export type GenreSlug = (typeof GENRE_SLUGS)[number];

export interface GenreDef {
  slug: GenreSlug;
  name: string;
  description: string;
}

// `sortOrder` in the DB is the index in this array (roughly popularity order on
// Roblox), so define them in the order you want them to appear.
export const GENRES: readonly GenreDef[] = [
  {
    slug: "simulator",
    name: "Simulator",
    description:
      "Repeated-action progression games where you grind a stat, pet, or resource (e.g. Pet/Power simulators).",
  },
  {
    slug: "tycoon",
    name: "Tycoon",
    description: "Build-and-earn games where you buy droppers/upgrades to grow a base or business.",
  },
  {
    slug: "obby",
    name: "Obby",
    description: "Obstacle-course platformers built around jumping challenges.",
  },
  {
    slug: "rpg",
    name: "RPG",
    description: "Role-playing games with character progression, quests, stats, and loot.",
  },
  {
    slug: "roleplay-life",
    name: "Roleplay & Life",
    description: "Social life-simulation and roleplay worlds (towns, families, jobs, schools).",
  },
  {
    slug: "tower-defense",
    name: "Tower Defense",
    description: "Place-and-upgrade defenders to stop waves of enemies along a path.",
  },
  {
    slug: "fighting",
    name: "Fighting / Combat",
    description: "Melee/ability combat, battle arenas, and PvP brawlers (not gun-focused).",
  },
  {
    slug: "shooter",
    name: "Shooter / FPS",
    description: "Gun-based first- or third-person shooters.",
  },
  {
    slug: "horror",
    name: "Horror",
    description: "Scary/survival-horror experiences built around fear and dread.",
  },
  {
    slug: "adventure",
    name: "Adventure",
    description: "Exploration- and quest-driven experiences across open or guided worlds.",
  },
  {
    slug: "survival",
    name: "Survival",
    description: "Gather resources and outlast threats, the environment, or other players.",
  },
  {
    slug: "sports",
    name: "Sports",
    description: "Sports and athletic games (soccer, basketball, etc.).",
  },
  {
    slug: "racing",
    name: "Racing",
    description: "Vehicle and foot-racing games focused on speed and courses.",
  },
  {
    slug: "clicker-idle",
    name: "Clicker / Idle",
    description: "Click- or idle-progression games with incremental, mostly-passive growth.",
  },
  {
    slug: "strategy",
    name: "Strategy",
    description: "Planning-heavy games: tactics, base/army management, card games.",
  },
  {
    slug: "minigame-party",
    name: "Minigame / Party",
    description: "Collections of quick rounds and party games (e.g. mini-game hubs).",
  },
  {
    slug: "sandbox-building",
    name: "Sandbox / Building",
    description: "Open-ended building and creation games with no fixed goal.",
  },
  {
    slug: "escape-story",
    name: "Escape / Story",
    description: "Linear escape-the-X and narrative experiences with scripted progression.",
  },
  {
    slug: "puzzle",
    name: "Puzzle",
    description: "Logic, riddle, and problem-solving games.",
  },
  {
    slug: "social-hangout",
    name: "Social / Hangout",
    description: "Chat-and-hang spaces with light or no objective (hangouts, condos, vibes).",
  },
];
