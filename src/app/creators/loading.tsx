import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function CreatorsLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-6" aria-busy="true">
      <span className="sr-only">Loading creators…</span>
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <TableSkeleton rows={10} cols={5} />
      <TableSkeleton rows={10} cols={6} />
    </div>
  );
}
