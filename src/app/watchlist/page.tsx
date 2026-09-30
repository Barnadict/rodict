import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { WatchlistRoute } from "./_components/watchlist-route";

export const metadata = { title: "Watchlist — rodict" };

export default function WatchlistPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Watchlist"
        description="Games and genres you're tracking — saved to this device only, no account needed. Share sends a link that holds the list."
      />
      {/* useSearchParams needs a boundary; the fallback is the prerendered shell. */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        }
      >
        <WatchlistRoute />
      </Suspense>
    </div>
  );
}
