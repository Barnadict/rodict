import { Skeleton } from "@/components/ui/skeleton";

/** Generic loading placeholder for a data table — used by route loading.tsx
 * files (Task #36) so navigation shows an instant, layout-matching skeleton
 * instead of a blank page while a page's DB queries resolve. */
export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div>
      <div className="flex items-center gap-4 border-b-2 border-rule px-2 py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-2 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
