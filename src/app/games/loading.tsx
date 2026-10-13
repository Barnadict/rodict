import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function GamesLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading games…</span>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-full sm:w-64" />
      </div>
      <TableSkeleton rows={10} cols={8} />
    </div>
  );
}
