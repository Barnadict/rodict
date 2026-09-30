import { Skeleton } from "@/components/ui/skeleton";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function WeeklyLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true">
      <span className="sr-only">Loading weekly recap…</span>
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <StatTilesSkeleton count={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TableSkeleton rows={10} cols={3} />
        <TableSkeleton rows={10} cols={3} />
      </div>
    </div>
  );
}
