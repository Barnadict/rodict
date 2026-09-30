/**
 * Embeddable live badge (Task #93): `/badge/<universeId>.svg` draws a
 * shields-style badge with a game's players now or its rank by players now,
 * for developers to put on their own pages. Pure, so it's tested without a
 * database.
 */

import { formatCompact } from "@/lib/format";

export type BadgeMetric = "players" | "rank";

/** `<universe id>.svg` → the id, or null. */
export function parseBadgeFile(file: string): string | null {
  const m = /^(\d{1,18})\.svg$/.exec(file);
  return m ? m[1] : null;
}

export function parseBadgeMetric(raw: string | null): BadgeMetric {
  return raw === "rank" ? "rank" : "players";
}

/**
 * Approximate advance widths of 11px Verdana, the badge font, in px. Only
 * sizes the boxes: the text is drawn with `textLength`, so it always fits the
 * box exactly whatever font the viewer has.
 */
function charWidth(c: string): number {
  if (/[iljI.,:;!|' ]/.test(c)) return 3.9;
  if (/[frt()\-[\]]/.test(c)) return 4.9;
  if (/[mwMW%]/.test(c)) return 10.7;
  if (/[A-Z#]/.test(c)) return 7.8;
  return 7;
}

export function textWidth(text: string): number {
  return Math.round([...text].reduce((w, c) => w + charWidth(c), 0));
}

function xml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface BadgeContent {
  label: string;
  value: string;
  /** Value box fill. */
  color: string;
  /** Hover text, e.g. the game's name. */
  title: string;
  /** Absolute link; opened when the SVG is viewed directly or via <object>. */
  href?: string;
}

const LABEL_COLOR = "#555";
export const BADGE_COLORS = { live: "#0e7490", muted: "#9f9f9f" } as const;

/** The label and value for a game, or a "not tracked" badge when it's missing. */
export function badgeContent(
  game: { name: string; currentPlaying: number; rank: number | null } | null,
  metric: BadgeMetric,
  href?: string,
): BadgeContent {
  if (!game) {
    return { label: "rodict", value: "not tracked", color: BADGE_COLORS.muted, title: "rodict" };
  }
  if (metric === "rank") {
    return {
      label: "rank by players",
      value: game.rank === null ? "unranked" : `#${game.rank.toLocaleString("en-US")}`,
      color: game.rank === null ? BADGE_COLORS.muted : BADGE_COLORS.live,
      title: `${game.name} on rodict`,
      href,
    };
  }
  return {
    label: "playing now",
    value: formatCompact(game.currentPlaying),
    color: BADGE_COLORS.live,
    title: `${game.name} on rodict`,
    href,
  };
}

/** A 20px-high, flat, two-part badge. */
export function renderBadge(b: BadgeContent): string {
  const pad = 6;
  const lw = textWidth(b.label) + 2 * pad;
  const vw = textWidth(b.value) + 2 * pad;
  const w = lw + vw;
  const text = (s: string, x: number, width: number) =>
    `<text x="${x}" y="14" textLength="${width}" lengthAdjust="spacingAndGlyphs">${xml(s)}</text>`;
  const shadow = (s: string, x: number, width: number) =>
    `<text x="${x}" y="15" fill="#010101" fill-opacity=".3" textLength="${width}" lengthAdjust="spacingAndGlyphs">${xml(s)}</text>`;
  const body = `<g shape-rendering="crispEdges"><rect width="${lw}" height="20" fill="${LABEL_COLOR}"/><rect x="${lw}" width="${vw}" height="20" fill="${b.color}"/></g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    ${shadow(b.label, lw / 2, lw - 2 * pad)}${text(b.label, lw / 2, lw - 2 * pad)}
    ${shadow(b.value, lw + vw / 2, vw - 2 * pad)}${text(b.value, lw + vw / 2, vw - 2 * pad)}
  </g>`;
  const inner = b.href ? `<a href="${xml(b.href)}" target="_blank">${body}</a>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${xml(`${b.label}: ${b.value}`)}">
  <title>${xml(`${b.title}: ${b.label} ${b.value}`)}</title>
  <clipPath id="r"><rect width="${w}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)">${inner}</g>
</svg>
`;
}

/** HTML and Markdown snippets that embed the badge, linked to the game page. */
export function badgeSnippets(origin: string, universeId: string, metric: BadgeMetric) {
  const img = `${origin}/badge/${universeId}.svg${metric === "rank" ? "?metric=rank" : ""}`;
  const page = `${origin}/games/${universeId}`;
  const alt = metric === "rank" ? "Rank by players on rodict" : "Players now on rodict";
  return {
    img,
    html: `<a href="${page}"><img src="${img}" alt="${alt}"></a>`,
    markdown: `[![${alt}](${img})](${page})`,
  };
}
