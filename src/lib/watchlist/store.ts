"use client";

/**
 * Local watchlist (Task #35) — games/genres a visitor wants to track, kept
 * entirely in localStorage. No account, no server round-trip to read/write it.
 *
 * Same useSyncExternalStore + subscribe/getSnapshot pattern already used by
 * use-mobile.ts and the theme toggle's hydration-safe mounted-check, so
 * multiple components (a page's WatchlistButton, the sidebar, /watchlist
 * itself) stay in sync with each other and with other tabs (`storage` event).
 */

import * as React from "react";

export type WatchlistKind = "game" | "genre";

export interface WatchlistEntry {
  kind: WatchlistKind;
  /** Game: universeId as a string (BigInt-safe). Genre: slug. */
  id: string;
  /** Snapshot of the display name at add-time, so the list still reads fine
   * before live data loads (or if the game/genre later disappears). */
  name: string;
  addedAt: string;
}

const STORAGE_KEY = "rodict:watchlist:v1";
const CHANGE_EVENT = "rodict:watchlist-change";

function isBrowser() {
  return typeof window !== "undefined";
}

function parse(raw: string | null): WatchlistEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WatchlistEntry[]) : [];
  } catch {
    return [];
  }
}

function read(): WatchlistEntry[] {
  if (!isBrowser()) return [];
  return parse(window.localStorage.getItem(STORAGE_KEY));
}

function write(entries: WatchlistEntry[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  // `storage` only fires in OTHER tabs/windows, not this one — dispatch our
  // own event so same-tab subscribers (e.g. the button that just got clicked)
  // re-render too.
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// Cached snapshot so useSyncExternalStore gets a referentially-stable array
// when nothing changed (required — it errors if getSnapshot returns a new
// object every call while nothing notified it to).
let cachedRaw: string | null | undefined;
let cachedEntries: WatchlistEntry[] = [];

function getSnapshot(): WatchlistEntry[] {
  const raw = isBrowser() ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (raw === cachedRaw) return cachedEntries;
  cachedRaw = raw;
  cachedEntries = parse(raw);
  return cachedEntries;
}

const EMPTY_ENTRIES: WatchlistEntry[] = [];

function getServerSnapshot(): WatchlistEntry[] {
  return EMPTY_ENTRIES;
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useWatchlist() {
  const entries = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isWatched = React.useCallback(
    (kind: WatchlistKind, id: string) => entries.some((e) => e.kind === kind && e.id === id),
    [entries],
  );

  const toggle = React.useCallback((kind: WatchlistKind, id: string, name: string) => {
    const current = read();
    const idx = current.findIndex((e) => e.kind === kind && e.id === id);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push({ kind, id, name, addedAt: new Date().toISOString() });
    }
    write(current);
  }, []);

  const remove = React.useCallback((kind: WatchlistKind, id: string) => {
    write(read().filter((e) => !(e.kind === kind && e.id === id)));
  }, []);

  return { entries, isWatched, toggle, remove };
}
