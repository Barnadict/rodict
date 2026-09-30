import { describe, expect, it } from "vitest";

import {
  buildGenreThemeMatrix,
  logShade,
  logShadeDomain,
  matrixKey,
  median,
  rollupThemes,
  type ThemeGameRow,
} from "./theme-matrix";

function row(
  gameId: string,
  themeId: string,
  genreId: string | null,
  playing: number,
): ThemeGameRow {
  return { gameId, themeId, genreId, playing, visits: BigInt(playing * 10) };
}

describe("median", () => {
  it("handles empty, odd and even lengths without mutating input", () => {
    const input = [5, 1, 3, 2];
    expect(median([])).toBe(0);
    expect(median([7, 1, 3])).toBe(3);
    expect(median(input)).toBe(2.5);
    expect(input).toEqual([5, 1, 3, 2]);
  });
});

describe("rollupThemes", () => {
  it("counts every tagged game, including ones without a genre", () => {
    const rollup = rollupThemes([
      row("a", "anime", "sim", 100),
      row("b", "anime", null, 10),
      row("c", "anime", "rpg", 1000),
      row("a", "fantasy", "sim", 100),
    ]);
    const anime = rollup.get("anime")!;
    expect(anime.n).toBe(3);
    expect(anime.totalPlaying).toBe(1110);
    expect(anime.medianPlaying).toBe(100);
    expect(anime.meanPlaying).toBe(370);
    expect(anime.totalVisits).toBe(BigInt(11100));
    expect(rollup.get("fantasy")!.n).toBe(1);
  });
});

describe("buildGenreThemeMatrix", () => {
  it("groups by genre and theme and leaves out games without a genre", () => {
    const m = buildGenreThemeMatrix([
      row("a", "anime", "sim", 10),
      row("b", "anime", "sim", 30),
      row("c", "anime", "rpg", 5),
      row("d", "anime", null, 999),
    ]);
    expect(m.size).toBe(2);
    expect(m.get(matrixKey("sim", "anime"))).toMatchObject({ n: 2, medianPlaying: 20 });
    expect(m.get(matrixKey("rpg", "anime"))).toMatchObject({ n: 1, totalPlaying: 5 });
  });
});

describe("logShade", () => {
  it("maps onto a log domain and clamps", () => {
    const domain = logShadeDomain([10, 1000, 0]);
    expect(domain).toEqual([1, 3]);
    expect(logShade(100, domain)).toBeCloseTo(0.5);
    expect(logShade(1e6, domain)).toBe(1);
    expect(logShade(0, domain)).toBe(0);
    expect(logShade(50, [2, 2])).toBe(0.5);
  });
});
