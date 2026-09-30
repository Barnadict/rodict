import { describe, expect, it } from "vitest";

import {
  BIG_MOVE_MIN_PLAYERS,
  FEED_MAX_IDS,
  FEED_WINDOW_DAYS,
  bigMove,
  buildFeedEntries,
  feedQuery,
  parseFeedIds,
  renderAtom,
  type FeedSubject,
} from "./feed";
import type { Anomaly } from "./db/analytics";

const H = 3_600_000;
const D = 24 * H;
const NOW = new Date("2026-09-30T12:00:00Z");

/** Readings every 3h over the last 8 days: `base` a week ago, `current` today. */
function week(base: number, current: number) {
  const out = [];
  for (let t = NOW.getTime() - 8 * D + 3 * H; t <= NOW.getTime(); t += 3 * H) {
    out.push({ t, playing: t > NOW.getTime() - D ? current : base });
  }
  return out;
}

const anomaly = (at: Date, over: Partial<Anomaly> = {}): Anomaly => ({
  at: at.toISOString(),
  value: 300,
  prevValue: 100,
  changePct: 2,
  direction: "spike",
  score: 9,
  ...over,
});

const subject = (over: Partial<FeedSubject>): FeedSubject => ({
  kind: "game",
  id: "123",
  name: "Game",
  anomalies: [],
  readings: [],
  ...over,
});

describe("parseFeedIds", () => {
  it("keeps valid ids, de-duplicated and sorted", () => {
    expect(parseFeedIds("9, 3,3,abc,1", "game")).toEqual(["1", "3", "9"]);
    expect(parseFeedIds("rpg,Bad Slug,obby", "genre")).toEqual(["obby", "rpg"]);
    expect(parseFeedIds(null, "game")).toEqual([]);
  });

  it("caps the list", () => {
    const raw = Array.from({ length: FEED_MAX_IDS + 10 }, (_, i) => String(i + 1)).join(",");
    expect(parseFeedIds(raw, "game")).toHaveLength(FEED_MAX_IDS);
  });

  it("builds the query back with readable commas", () => {
    expect(feedQuery({ games: ["1", "2"], genres: ["rpg"] })).toBe("?games=1,2&genres=rpg");
    expect(feedQuery({ games: [], genres: [] })).toBeNull();
  });
});

describe("bigMove", () => {
  it("needs both the share and the player bar", () => {
    expect(bigMove(week(1000, 1300))).toMatchObject({ base: 1000, current: 1300 });
    expect(bigMove(week(1000, 1200))).toBeNull(); // +20%
    expect(bigMove(week(100, 100 + BIG_MOVE_MIN_PLAYERS - 1))).toBeNull(); // +49%, 49 players
    expect(bigMove(week(1000, 500))).toMatchObject({ pct: -0.5 });
  });

  it("needs readings a week apart", () => {
    expect(bigMove(week(1000, 2000).slice(-8))).toBeNull();
  });
});

describe("buildFeedEntries", () => {
  it("lists recent flagged changes and big moves, newest first", () => {
    const entries = buildFeedEntries(
      [
        subject({
          anomalies: [
            anomaly(new Date(NOW.getTime() - 2 * D)),
            anomaly(new Date(NOW.getTime() - (FEED_WINDOW_DAYS + 1) * D)), // too old
          ],
        }),
        subject({ kind: "genre", id: "rpg", name: "RPG", readings: week(10_000, 5_000) }),
      ],
      NOW,
    );
    expect(entries.map((e) => e.title)).toEqual([
      "Down -50% this week: RPG (genre)",
      "Spike: Game players +200%",
    ]);
    expect(entries[0].path).toBe("/genres/rpg");
    expect(entries[0].id).toBe("urn:rodict:move:genre:rpg:2026-09-30");
    expect(entries[1].path).toBe("/games/123");
  });

  it("keeps entry ids stable across rebuilds", () => {
    const s = [subject({ anomalies: [anomaly(new Date(NOW.getTime() - D))] })];
    const later = new Date(NOW.getTime() + 3 * H);
    expect(buildFeedEntries(s, NOW)[0].id).toBe(buildFeedEntries(s, later)[0].id);
  });
});

describe("renderAtom", () => {
  it("escapes text and makes links absolute", () => {
    const doc = renderAtom({
      origin: "https://example.com",
      selfPath: "/feed?games=1&genres=rpg",
      entries: [
        {
          id: "urn:x",
          title: `<b>"Tom & Jerry's"</b>`,
          summary: "s",
          path: "/games/1",
          updated: NOW,
        },
      ],
      updated: NOW,
      title: "t",
      subtitle: "s",
      alternatePath: "/watchlist",
    });
    expect(doc).toContain("<title>&lt;b&gt;&quot;Tom &amp; Jerry&apos;s&quot;&lt;/b&gt;</title>");
    expect(doc).toContain('<link href="https://example.com/games/1"/>');
    expect(doc).toContain('href="https://example.com/feed?games=1&amp;genres=rpg"');
    expect(doc).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it("escapes HTML content", () => {
    const doc = renderAtom({
      origin: "https://example.com",
      selfPath: "/weekly/feed",
      entries: [
        {
          id: "urn:y",
          title: "t",
          summary: "s",
          path: "/weekly",
          updated: NOW,
          content: "<p>A & B</p>",
        },
      ],
      updated: NOW,
      title: "t",
      subtitle: "s",
      alternatePath: "/weekly",
    });
    expect(doc).toContain('<content type="html">&lt;p&gt;A &amp; B&lt;/p&gt;</content>');
  });
});
