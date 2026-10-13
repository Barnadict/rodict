import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function ThemesLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading themes…</span>
      <PageHeaderSkeleton />
      <TableSkeleton rows={14} cols={6} />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
