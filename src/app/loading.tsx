import { PageHeaderSkeleton } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="flex flex-1 flex-col gap-10 p-6" aria-busy="true">
      <span className="sr-only">Loading the players chart…</span>
      <PageHeaderSkeleton />
      <div className="grid gap-x-11 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="border-b-2 border-rule pb-1.5">
            <Skeleton className="h-4 w-24" />
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 border-b py-2.5">
              <Skeleton className="h-10 w-9" />
              <Skeleton className="size-10" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          <div className="border-b-2 border-rule pb-1.5">
            <Skeleton className="h-6 w-32" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 border-b py-2">
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
