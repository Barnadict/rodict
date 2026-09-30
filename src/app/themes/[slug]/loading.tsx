import { Skeleton } from "@/components/ui/skeleton";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function ThemeDetailLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true">
      <span className="sr-only">Loading theme…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-48 max-w-full" />
      </div>
      <StatTilesSkeleton count={4} />
      <TableSkeleton rows={6} cols={4} />
      <TableSkeleton rows={10} cols={5} />
    </div>
  );
}
