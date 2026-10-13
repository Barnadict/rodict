import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function NewReleasesLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading new releases…</span>
      <PageHeaderSkeleton />
      <Skeleton className="h-16 w-full rounded-lg" />
      <StatTilesSkeleton count={3} />
      <Skeleton className="h-72 w-full rounded-lg" />
      <TableSkeleton rows={10} cols={7} />
    </div>
  );
}
