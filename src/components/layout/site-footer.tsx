import { Suspense } from "react";
import Link from "next/link";

import { DataFreshness } from "./data-freshness";

export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-6 text-sm text-muted-foreground">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          rodict is an unofficial, personal project. Not affiliated with Roblox Corporation.
          Earnings figures are estimates — see{" "}
          <Link href="/about" className="underline underline-offset-4">
            About the data
          </Link>
          .
        </p>
        <div className="flex items-center gap-4">
          {/* Suspense keeps a slow/unreachable DB from blocking the whole footer. */}
          <Suspense fallback={null}>
            <DataFreshness />
          </Suspense>
          <p className="shrink-0">&copy; {new Date().getFullYear()} rodict</p>
        </div>
      </div>
    </footer>
  );
}
