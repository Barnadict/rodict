import { describe, it, expect } from "vitest";

import {
  buildTable,
  csvCell,
  exportFileName,
  exportHref,
  parseExportFormat,
  toCsv,
  toJson,
  usd,
} from "./export";

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("neutralizes spreadsheet formulas in text but not in numbers", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1 Speed")).toBe("'+1 Speed");
    expect(csvCell("@user")).toBe("'@user");
    expect(csvCell(-0.25)).toBe("-0.25");
  });

  it("writes null as empty and booleans as words", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("true");
  });
});

describe("toCsv / toJson", () => {
  const table = buildTable(
    "games",
    [
      { name: "name", value: (r: { n: string; p: number }) => r.n },
      { name: "players", value: (r) => r.p },
    ],
    [
      { n: "Blox, Fruits", p: 100 },
      { n: "🌊 Raft", p: 5 },
    ],
    ["note"],
  );

  it("writes a BOM, a header row and CRLF lines", () => {
    expect(toCsv(table)).toBe('﻿name,players\r\n"Blox, Fruits",100\r\n🌊 Raft,5\r\n');
  });

  it("writes rows as objects keyed by column, with notes and a timestamp", () => {
    const json = JSON.parse(toJson(table, new Date("2026-09-30T00:00:00Z")));
    expect(json).toEqual({
      dataset: "games",
      generatedAt: "2026-09-30T00:00:00.000Z",
      notes: ["note"],
      rows: [
        { name: "Blox, Fruits", players: 100 },
        { name: "🌊 Raft", players: 5 },
      ],
    });
  });
});

describe("helpers", () => {
  it("parses the format, defaulting to CSV", () => {
    expect(parseExportFormat("json")).toBe("json");
    expect(parseExportFormat("xml")).toBe("csv");
    expect(parseExportFormat(null)).toBe("csv");
  });

  it("builds file names and links", () => {
    const at = new Date("2026-09-30T12:00:00Z");
    expect(exportFileName("trending games", "csv", at)).toBe(
      "rodict-trending-games-2026-09-30.csv",
    );
    expect(exportHref("games", "json", { genre: "obby", q: undefined })).toBe(
      "/api/export/games?genre=obby&format=json",
    );
  });

  it("rounds USD to cents", () => {
    expect(usd(12.3456)).toBe(12.35);
  });
});
