/**
 * One-line definitions of the derived stats (Task #112). The "?" next to a stat
 * and the matching /about entry both read from here, so they can't disagree:
 * /about opens each entry with `definition` and gives it `anchor` as its id.
 */

export const GLOSSARY = {
  earnings: {
    term: "Est. earnings",
    definition:
      "A range worked out from public signals (visits and players) times assumed Robux rates, converted at the DevEx rate. Not real revenue.",
    anchor: "earnings",
  },
  session: {
    term: "Est. session length",
    definition:
      "Average minutes per visit, estimated as players ÷ new visits per hour over the last day.",
    anchor: "est-session",
  },
  favoritesPer1k: {
    term: "Favorites per 1K visits",
    definition: "All-time favorites ÷ all-time visits × 1,000, from Roblox's own counters.",
    anchor: "engagement-ratios",
  },
  likeRatio: {
    term: "Like ratio",
    definition: "Likes ÷ (likes + dislikes), from Roblox's own counters.",
    anchor: "engagement-ratios",
  },
  concentration: {
    term: "Market concentration (HHI)",
    definition:
      "How much of a genre's players its biggest games hold: the sum of every game's squared share, 0–10,000.",
    anchor: "concentration",
  },
  opportunity: {
    term: "Opportunity score",
    definition:
      "A 0–100 mix of players per game, total players and growth, minus crowding, scaled across genres. A signal, not advice.",
    anchor: "opportunity-score",
  },
  launchBenchmark: {
    term: "Launch benchmark",
    definition:
      "Where a game's daily average players sits among its genre's launches on the same day since launch.",
    anchor: "launch-benchmarks",
  },
} as const satisfies Record<string, { term: string; definition: string; anchor: string }>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The /about link for an entry. */
export function glossaryHref(key: GlossaryKey): string {
  return `/about#${GLOSSARY[key].anchor}`;
}
