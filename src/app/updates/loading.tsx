import { PageHeaderSkeleton } from "@/components/page-header";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function UpdatesLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading update cadence…</span>
      <PageHeaderSkeleton />
      <TableSkeleton rows={10} cols={6} />
      <TableSkeleton rows={10} cols={6} />
    </div>
  );
}
