import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function SaturationLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true">
      <span className="sr-only">Loading saturation…</span>
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-90 w-full rounded-lg" />
      <TableSkeleton rows={8} cols={5} />
    </div>
  );
}
