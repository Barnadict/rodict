import { Skeleton } from "@/components/ui/skeleton";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function NewReleasesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true">
      <span className="sr-only">Loading new releases…</span>
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <StatTilesSkeleton count={3} />
      <Skeleton className="h-72 w-full rounded-lg" />
      <TableSkeleton rows={10} cols={7} />
    </div>
  );
}
