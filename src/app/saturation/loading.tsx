import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function SaturationLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading saturation…</span>
      <PageHeaderSkeleton />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-90 w-full rounded-lg" />
      <TableSkeleton rows={8} cols={5} />
    </div>
  );
}
