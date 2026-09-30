import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function ThemesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true">
      <span className="sr-only">Loading themes…</span>
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <TableSkeleton rows={14} cols={6} />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
