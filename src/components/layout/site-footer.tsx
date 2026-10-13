import { Suspense } from "react";
import Link from "next/link";
import { cacheLife } from "next/cache";

import { Wordmark } from "@/components/logo";
import { REFERENCE_ITEMS } from "@/lib/nav";

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
    <footer className="mt-10 border-t-2 border-rule px-6 pt-6 pb-8 text-sm text-muted-foreground">
      <div className="flex flex-col gap-8 md:flex-row md:justify-between">
        <div className="flex max-w-md flex-col gap-3">
          <Wordmark className="text-xl" />
          <p>
            An unofficial, personal project. Not affiliated with Roblox Corporation. It tracks a
            sample of games, not all of Roblox, and earnings figures are estimates.
          </p>
        </div>
        <nav aria-label="Reference" className="flex flex-col gap-2">
          <h2 className="text-foreground font-display">Reference</h2>
          <ul className="flex flex-col">
            {REFERENCE_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-8 items-center text-foreground hover:underline"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-2 md:items-end md:text-right">
          {/* Suspense keeps a slow/unreachable DB from blocking the whole footer. */}
          <Suspense fallback={null}>
            <DataFreshness />
          </Suspense>
          <p>
            &copy; <CopyrightYear /> rodict
          </p>
        </div>
      </div>
    </footer>
  );
}
