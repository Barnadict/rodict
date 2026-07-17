import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function GenresLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6" aria-busy="true">
      <span className="sr-only">Loading genres…</span>
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-8 w-56" />
      <TableSkeleton rows={12} cols={6} />
    </div>
  );
}
