/**
 * CSV/JSON export (Task #71): turn a list of rows into a download. Pure so the
 * escaping rules are unit-tested.
 *
 * Estimated values keep an `est_` prefix in their column names (e.g.
 * `est_earnings_low_usd_per_day`), so a spreadsheet can never present one as
 * official Roblox data, and every file carries notes saying what's estimated.
 */

export type ExportFormat = "csv" | "json";
export type Cell = string | number | boolean | null;

export function parseExportFormat(raw: string | null | undefined): ExportFormat {
  return raw === "json" ? "json" : "csv";
}

export interface ExportColumn<T> {
  name: string;
  value: (row: T) => Cell;
}

export interface ExportTable {
  /** Dataset name, used in the file name and the JSON body. */
  dataset: string;
  columns: string[];
  rows: Cell[][];
  /** What the numbers mean: estimate labels, filters, rules. */
  notes: string[];
}

export function buildTable<T>(
  dataset: string,
  columns: ExportColumn<T>[],
  rows: T[],
  notes: string[] = [],
): ExportTable {
  return {
    dataset,
    columns: columns.map((c) => c.name),
    rows: rows.map((r) => columns.map((c) => c.value(r))),
    notes,
  };
}

/**
 * One CSV cell. Quotes cells containing a comma, quote or line break, and
 * prefixes text starting with = + - @ (or a tab/CR) with an apostrophe so a
 * spreadsheet shows a game named "=HYPERLINK(...)" as text instead of running
 * it as a formula. Numbers are written as-is.
 */
export function csvCell(value: Cell): string {
  if (value === null) return "";
  if (typeof value !== "string") return String(value);
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with a UTF-8 BOM, so Excel reads emoji and accents in names. */
export function toCsv(table: ExportTable): string {
  const lines = [table.columns, ...table.rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function toJson(table: ExportTable, generatedAt: Date): string {
  return JSON.stringify(
    {
      dataset: table.dataset,
      generatedAt: generatedAt.toISOString(),
      notes: table.notes,
      rows: table.rows.map((row) => Object.fromEntries(table.columns.map((c, i) => [c, row[i]]))),
    },
    null,
    2,
  );
}

/** e.g. "rodict-games-2026-09-30.csv". */
export function exportFileName(dataset: string, format: ExportFormat, at: Date): string {
  const safe = dataset
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `rodict-${safe}-${at.toISOString().slice(0, 10)}.${format}`;
}

/** Round a USD estimate to cents; keeps exported files readable. */
export function usd(value: number): number {
  return Math.round(value * 100) / 100;
}

/** ISO timestamp, or null. */
export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** The export link for a dataset and the current page's params. */
export function exportHref(
  dataset: string,
  format: ExportFormat,
  params: Record<string, string | undefined> = {},
): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  search.set("format", format);
  return `/api/export/${dataset}?${search.toString()}`;
}

export const ESTIMATE_NOTE =
  "Columns starting with est_ are rodict's estimates, not Roblox data. Roblox publishes no revenue figures; see /about for how they're made.";
