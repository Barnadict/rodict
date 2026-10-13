import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function GenresLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading genres…</span>
      <PageHeaderSkeleton />
      <Skeleton className="h-8 w-56" />
      <TableSkeleton rows={12} cols={6} />
    </div>
  );
}
