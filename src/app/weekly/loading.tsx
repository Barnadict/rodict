import { PageHeaderSkeleton } from "@/components/page-header";
import { StatTilesSkeleton } from "@/components/data-table/stat-tiles-skeleton";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function WeeklyLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading weekly recap…</span>
      <PageHeaderSkeleton />
      <StatTilesSkeleton count={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TableSkeleton rows={10} cols={3} />
        <TableSkeleton rows={10} cols={3} />
      </div>
    </div>
  );
}
