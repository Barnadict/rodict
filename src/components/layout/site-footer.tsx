import { Suspense } from "react";
import Link from "next/link";
import { cacheLife } from "next/cache";

import { DataFreshness } from "./data-freshness";

/**
 * The copyright year reads the clock, which would otherwise force this footer —
 * and therefore every page's shell — to render per request. Caching it keeps the
 * shell static; the only cost is that the year can lag into January by up to the
 * revalidate window, which is immaterial for a copyright notice.
 */
async function CopyrightYear() {
  "use cache";
  cacheLife("max");
  return <>{new Date().getFullYear()}</>;
}

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
          <p className="shrink-0">
            &copy; <CopyrightYear /> rodict
          </p>
        </div>
      </div>
    </footer>
  );
}
