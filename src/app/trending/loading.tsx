import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function TrendingLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading trending…</span>
      <PageHeaderSkeleton />
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-6 lg:grid-cols-2">
        <TableSkeleton rows={8} cols={4} />
        <TableSkeleton rows={8} cols={4} />
      </div>
    </div>
  );
}
