/**
 * The mapping layer: turn whatever Roblox gives us (its coarse genre/tag strings
 * + the game's name) into OUR normalized genre + themes.
 *
 * Resolution priority for genre (first that produces a result wins):
 *   1. manual override      (source "manual")   — hand-curated, see overrides.ts
 *   2. name keyword         (source "inferred") — Roblox naming conventions are
 *      extremely reliable for our fine-grained gameplay genres (Tycoon, Obby,
 *      Simulator, Clicker, Tower Defense…) that Roblox's coarse genres can't
 *      express.
 *   3. Roblox genre/tag     (source "roblox_tag") — the API's own category.
 *   4. null (unknown)       — we deliberately do NOT force a wrong genre; a
 *      missing genre is better than a bad one (it would poison every stat).
 *
 * Themes are independent and can be several per game; they're gathered from both
 * the game name and Roblox's thematic genres (which we otherwise ignore for
 * gameplay). See genres.ts / themes.ts for the source-of-truth lists.
 */

import type { GenreSource } from "@/lib/db-constants";

import type { GenreSlug } from "./genres";
import type { ThemeSlug } from "./themes";
import { getManualOverride } from "./overrides";

/** Lowercase + strip everything but a–z/0–9, so "Sports & Racing" -> "sportsracing". */
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Roblox genre/tag -> our genre (covers both the legacy `Genre` enum and the
// modern Charts genre categories; keys are pre-normalized). `null` means "no
// gameplay mapping" — usually a purely thematic Roblox genre that instead feeds
// theme detection below.
// ---------------------------------------------------------------------------
const ROBLOX_GENRE_MAP: Record<string, GenreSlug | null> = {
  // modern Charts genres
  adventure: "adventure",
  obbyandplatformer: "obby",
  obbyplatformer: "obby",
  partyandcasual: "minigame-party",
  partycasual: "minigame-party",
  puzzle: "puzzle",
  rpg: "rpg",
  roleplayandavatarsim: "roleplay-life",
  roleplayavatarsim: "roleplay-life",
  shooter: "shooter",
  simulation: "simulator",
  simulator: "simulator",
  social: "social-hangout",
  socialhangout: "social-hangout",
  sportsandracing: "sports",
  sportsracing: "sports",
  strategy: "strategy",
  survival: "survival",
  tycoon: "tycoon",
  action: null,
  utilityandother: null,
  utilityother: null,
  wild: null,
  education: null,
  entertainment: null,
  shopping: null,
  all: null,
  // legacy Genre enum
  building: "sandbox-building",
  horror: "horror",
  townandcity: "roleplay-life",
  fps: "shooter",
  fighting: "fighting",
  sports: "sports",
  skatepark: "sports",
  comedy: null,
  tutorial: null,
  // purely thematic legacy values -> no gameplay genre (see ROBLOX_THEME_MAP)
  scifi: null,
  fantasy: null,
  medieval: null,
  military: null,
  war: null,
  naval: null,
  ninja: null,
  pirate: null,
  western: null,
  wildwest: null,
};

// Roblox's thematic genres are useless for gameplay but useful as THEMES.
const ROBLOX_THEME_MAP: Record<string, ThemeSlug> = {
  scifi: "sci-fi",
  fantasy: "fantasy",
  medieval: "medieval",
  military: "military",
  war: "military",
  naval: "military",
  ninja: "ninja",
  pirate: "pirate",
  western: "western",
  wildwest: "western",
};

// ---------------------------------------------------------------------------
// Name keyword rules. First match wins, so order = specificity (broad genres
// like "adventure" go last). Word boundaries avoid matching inside other words.
// ---------------------------------------------------------------------------
const KEYWORD_GENRE_RULES: { re: RegExp; genre: GenreSlug }[] = [
  { re: /\btower\s*defen[cs]e\b|\btd\b/i, genre: "tower-defense" },
  { re: /\btycoon\b/i, genre: "tycoon" },
  { re: /\bobby\b|\bparkour\b/i, genre: "obby" },
  { re: /\bsimulator\b|\bsim\b/i, genre: "simulator" },
  { re: /\bclicker\b|\bidle\b/i, genre: "clicker-idle" },
  { re: /\bescape\b|\bstory\b/i, genre: "escape-story" },
  { re: /\bhorror\b|\bscary\b|\bnightmare\b|\bhaunted\b/i, genre: "horror" },
  { re: /\bshooter\b|\bfps\b|\bgun[s]?\b|\bstrike\b/i, genre: "shooter" },
  { re: /\brac(e|ing)\b|\bdrift\b|\bkart\b/i, genre: "racing" },
  { re: /\brpg\b/i, genre: "rpg" },
  { re: /\broleplay\b|\brp\b|\blife\b|\btown\b|\bcity\b/i, genre: "roleplay-life" },
  { re: /\bsurviv(e|al)\b/i, genre: "survival" },
  { re: /\bhangout\b|\bchill\b|\bvibe[s]?\b|\bcondo\b/i, genre: "social-hangout" },
  { re: /\bsandbox\b|\bbuild(ing)?\b|\bcraft\b/i, genre: "sandbox-building" },
  { re: /\bsports\b|\bsoccer\b|\bfootball\b|\bbasketball\b/i, genre: "sports" },
  { re: /\bfight(ing)?\b|\bcombat\b|\bbattle\b|\barena\b|\bbrawl\b|\bwar\b/i, genre: "fighting" },
  { re: /\bpuzzle\b/i, genre: "puzzle" },
  { re: /\bstrateg(y|ic)\b|\btactic[s]?\b/i, genre: "strategy" },
  { re: /\bminigame[s]?\b|\bmini\s*game[s]?\b|\bparty\b/i, genre: "minigame-party" },
  { re: /\badventure\b|\bquest\b/i, genre: "adventure" },
];

// Theme keyword rules — ALL matches apply (a game can have several themes).
const KEYWORD_THEME_RULES: { re: RegExp; theme: ThemeSlug }[] = [
  { re: /\banime\b/i, theme: "anime" },
  { re: /\bfantasy\b|\bdragon[s]?\b|\bmagic\b|\bwizard\b|\bmage\b/i, theme: "fantasy" },
  { re: /\bsci-?fi\b|\bcyber\b|\brobot[s]?\b|\balien[s]?\b/i, theme: "sci-fi" },
  { re: /\bspace\b|\bgalax(y|ies)\b|\bcosmic\b|\bplanet[s]?\b/i, theme: "space" },
  { re: /\bmedieval\b|\bknight[s]?\b|\bcastle[s]?\b|\bkingdom[s]?\b/i, theme: "medieval" },
  { re: /\bmilitary\b|\barmy\b|\bsoldier[s]?\b|\bwar\b/i, theme: "military" },
  { re: /\bsuperhero\b|\bhero(es)?\b|\bmarvel\b|\bavenger[s]?\b/i, theme: "superhero" },
  { re: /\bpirate[s]?\b|\bsail\b/i, theme: "pirate" },
  { re: /\bzombie[s]?\b|\bundead\b|\binfection\b/i, theme: "zombie" },
  { re: /\bninja[s]?\b|\bsamurai\b|\bshinobi\b/i, theme: "ninja" },
  { re: /\bwestern\b|\bcowboy[s]?\b|\bwild\s*west\b|\bbandit[s]?\b/i, theme: "western" },
  { re: /\bschool\b|\bacademy\b|\bclassroom\b/i, theme: "school" },
  { re: /\banimal[s]?\b|\bpet[s]?\b|\bhorse[s]?\b/i, theme: "animals" },
  { re: /\bcar[s]?\b|\bvehicle[s]?\b|\btruck[s]?\b/i, theme: "vehicles" },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenreResolutionInput {
  /** For manual-override lookup; optional so the resolver stays pure/testable. */
  universeId?: bigint | string;
  name: string;
  /** Whatever Roblox returns — legacy enum values and/or modern chart genres. */
  robloxGenres?: string[];
}

export interface GenreResolution {
  /** Our normalized genre, or null when nothing is confident enough. */
  genre: GenreSlug | null;
  source: GenreSource;
  confidence: "high" | "medium" | "low";
  /** What triggered the match (a keyword or Roblox tag), for auditing. */
  matched?: string;
}

/** Map Roblox's genre/tag strings to our genre, taking the first that maps. */
function fromRobloxGenres(
  robloxGenres: string[] | undefined,
): { genre: GenreSlug; matched: string } | null {
  for (const raw of robloxGenres ?? []) {
    const mapped = ROBLOX_GENRE_MAP[normalizeKey(raw)];
    if (mapped) return { genre: mapped, matched: raw };
  }
  return null;
}

/** Infer a genre from the game name via keyword rules. */
function fromName(name: string): { genre: GenreSlug; matched: string } | null {
  for (const { re, genre } of KEYWORD_GENRE_RULES) {
    const m = name.match(re);
    if (m) return { genre, matched: m[0] };
  }
  return null;
}

/** Resolve a single normalized genre for a game. Pure + deterministic. */
export function resolveGameGenre(input: GenreResolutionInput): GenreResolution {
  // 1. manual override
  if (input.universeId !== undefined) {
    const override = getManualOverride(input.universeId);
    if (override?.genre) {
      return { genre: override.genre, source: "manual", confidence: "high" };
    }
  }

  // 2. name keyword inference (high confidence for our fine-grained genres)
  const byName = fromName(input.name);
  if (byName) {
    return {
      genre: byName.genre,
      source: "inferred",
      confidence: "high",
      matched: byName.matched,
    };
  }

  // 3. Roblox's own genre/tag
  const byRoblox = fromRobloxGenres(input.robloxGenres);
  if (byRoblox) {
    return {
      genre: byRoblox.genre,
      source: "roblox_tag",
      confidence: "medium",
      matched: byRoblox.matched,
    };
  }

  // 4. unknown — don't guess
  return { genre: null, source: "inferred", confidence: "low" };
}

/** Resolve all applicable themes for a game (may be empty). */
export function resolveGameThemes(input: {
  universeId?: bigint | string;
  name: string;
  robloxGenres?: string[];
}): ThemeSlug[] {
  // manual override wins outright if it specifies themes
  if (input.universeId !== undefined) {
    const override = getManualOverride(input.universeId);
    if (override?.themes) return [...override.themes];
  }

  const themes = new Set<ThemeSlug>();
  for (const raw of input.robloxGenres ?? []) {
    const t = ROBLOX_THEME_MAP[normalizeKey(raw)];
    if (t) themes.add(t);
  }
  for (const { re, theme } of KEYWORD_THEME_RULES) {
    if (re.test(input.name)) themes.add(theme);
  }
  return [...themes];
}
