import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";

export default function CompareLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading comparison…</span>
      <PageHeaderSkeleton />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-80 w-full rounded-lg" />
      <StatTilesSkeleton count={4} />
    </div>
  );
}
