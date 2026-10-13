import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function WatchlistLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading watchlist…</span>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
