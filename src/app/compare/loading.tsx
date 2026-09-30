import { Skeleton } from "@/components/ui/skeleton";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";

export default function CompareLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true">
      <span className="sr-only">Loading comparison…</span>
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-80 w-full rounded-lg" />
      <StatTilesSkeleton count={4} />
    </div>
  );
}
