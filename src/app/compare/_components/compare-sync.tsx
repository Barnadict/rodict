"use client";

import * as React from "react";

import type { CompareSelection } from "@/lib/compare";
import { writeCompareSelection } from "@/lib/compare-store";

/** Remembers the comparison this page shows, so "Compare" elsewhere adds to it. */
export function CompareSync({ selection }: { selection: CompareSelection }) {
  const games = selection.games.join(",");
  const genres = selection.genres.join(",");
  React.useEffect(() => {
    writeCompareSelection({
      games: games ? games.split(",") : [],
      genres: genres ? genres.split(",") : [],
    });
  }, [games, genres]);
  return null;
}
