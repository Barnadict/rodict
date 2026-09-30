"use client";

/**
 * The visitor's current comparison (Task #65), remembered in localStorage so
 * "Compare" on a game or genre page adds to it rather than starting over. The
 * URL stays the source of truth: /compare writes whatever it's showing back
 * here, so removing a series there is remembered too. Same
 * useSyncExternalStore pattern as the watchlist store.
 */

import * as React from "react";

import { EMPTY_SELECTION, parseIdList, type CompareSelection } from "@/lib/compare";

const STORAGE_KEY = "rodict:compare:v1";
const CHANGE_EVENT = "rodict:compare-change";

function parse(raw: string | null): CompareSelection {
  if (!raw) return EMPTY_SELECTION;
  try {
    const v = JSON.parse(raw) as Partial<CompareSelection>;
    // Re-validate: storage is user-editable.
    return {
      games: parseIdList(Array.isArray(v.games) ? v.games.join(",") : "", "game"),
      genres: parseIdList(Array.isArray(v.genres) ? v.genres.join(",") : "", "genre"),
    };
  } catch {
    return EMPTY_SELECTION;
  }
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readCompareSelection(): CompareSelection {
  return typeof window === "undefined" ? EMPTY_SELECTION : parse(readRaw());
}

export function writeCompareSelection(sel: CompareSelection) {
  try {
    const raw = JSON.stringify(sel);
    if (raw === readRaw()) return;
    window.localStorage.setItem(STORAGE_KEY, raw);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage blocked (private mode): the URL still carries the comparison.
  }
}

let cachedRaw: string | null | undefined;
let cached: CompareSelection = EMPTY_SELECTION;

function getSnapshot(): CompareSelection {
  const raw = readRaw();
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = parse(raw);
  return cached;
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useCompareSelection(): CompareSelection {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SELECTION);
}
