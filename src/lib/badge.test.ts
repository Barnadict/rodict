import { describe, expect, it } from "vitest";

import {
  badgeContent,
  badgeSnippets,
  parseBadgeFile,
  parseBadgeMetric,
  renderBadge,
  textWidth,
} from "@/lib/badge";

describe("parseBadgeFile", () => {
  it("accepts <universe id>.svg only", () => {
    expect(parseBadgeFile("123456.svg")).toBe("123456");
    expect(parseBadgeFile("123456")).toBeNull();
    expect(parseBadgeFile("abc.svg")).toBeNull();
    expect(parseBadgeFile("1".repeat(19) + ".svg")).toBeNull();
  });

  it("defaults the metric to players", () => {
    expect(parseBadgeMetric("rank")).toBe("rank");
    expect(parseBadgeMetric(null)).toBe("players");
    expect(parseBadgeMetric("x")).toBe("players");
  });
});

describe("badgeContent", () => {
  const game = { name: "Obby", currentPlaying: 12_345, rank: 42 };

  it("shows players now or the rank", () => {
    expect(badgeContent(game, "players").value).toBe("12.3K");
    expect(badgeContent(game, "rank").value).toBe("#42");
    expect(badgeContent({ ...game, rank: null }, "rank").value).toBe("unranked");
  });

  it("falls back to not tracked", () => {
    expect(badgeContent(null, "players")).toMatchObject({ value: "not tracked" });
  });
});

describe("renderBadge", () => {
  it("sizes both boxes to their text and escapes it", () => {
    const b = {
      label: "a&b",
      value: "<1>",
      color: "#000",
      title: `"x"`,
      href: "https://x.test/?a=1&b=2",
    };
    const svg = renderBadge(b);
    const w = textWidth("a&b") + textWidth("<1>") + 24;
    expect(svg).toContain(`width="${w}"`);
    expect(svg).toContain("a&amp;b");
    expect(svg).toContain("&lt;1&gt;");
    expect(svg).toContain('href="https://x.test/?a=1&amp;b=2"');
    expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
  });
});

describe("badgeSnippets", () => {
  it("links the image to the game page", () => {
    const s = badgeSnippets("https://x.test", "9", "rank");
    expect(s.markdown).toBe(
      "[![Rank by players on rodict](https://x.test/badge/9.svg?metric=rank)](https://x.test/games/9)",
    );
    expect(s.html).toContain('<a href="https://x.test/games/9">');
  });
});
