import { PageHeaderSkeleton } from "@/components/page-header";
import { SectionSkeleton } from "@/components/data-table/section-skeleton";

export default function OpportunitiesLoading() {
  return (
    <div className="page-stack" aria-busy="true">
      <span className="sr-only">Loading niche finder…</span>
      <PageHeaderSkeleton />
      <SectionSkeleton className="h-40" />
      <SectionSkeleton title="Genres" className="h-96" />
    </div>
  );
}
