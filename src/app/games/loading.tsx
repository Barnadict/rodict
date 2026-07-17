import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function GamesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6" aria-busy="true">
      <span className="sr-only">Loading games…</span>
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-full sm:w-64" />
      </div>
      <TableSkeleton rows={10} cols={8} />
    </div>
  );
}
