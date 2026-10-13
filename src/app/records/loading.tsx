import { PageHeaderSkeleton } from "@/components/page-header";
import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function RecordsLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading records…</span>
      <PageHeaderSkeleton />
      <TableSkeleton rows={10} cols={5} />
      <TableSkeleton rows={10} cols={6} />
    </div>
  );
}
