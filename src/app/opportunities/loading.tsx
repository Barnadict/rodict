import { Skeleton } from "@/components/ui/skeleton";
import { SectionSkeleton } from "@/components/data-table/section-skeleton";

export default function OpportunitiesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6" aria-busy="true">
      <span className="sr-only">Loading niche finder…</span>
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
      </div>
      <SectionSkeleton className="h-40" />
      <SectionSkeleton title="Genres" className="h-96" />
    </div>
  );
}
