import { Skeleton } from "@/components/ui/skeleton";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";

export default function GameDetailLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true">
      <span className="sr-only">Loading game…</span>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-56 max-w-full" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <Skeleton className="h-7 w-24 shrink-0" />
      </div>
      <StatTilesSkeleton count={6} />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </div>
  );
}
