import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for a StatTile grid — see table-skeleton.tsx for why this
 * exists (route loading.tsx files, Task #36). */
export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-t-2 border-rule pt-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-7 w-24" />
        </div>
      ))}
    </div>
  );
}
