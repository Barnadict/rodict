import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for one streamed page section (Task #97): the section's heading
 * stays readable while its data loads, and the block below holds its place so
 * the page doesn't jump when it arrives.
 */
export function SectionSkeleton({
  title,
  className = "h-48",
}: {
  title?: string;
  /** Size of the placeholder block, e.g. a chart's height. */
  className?: string;
}) {
  return (
    <section className="flex flex-col gap-3" aria-busy="true">
      {title ? <h2 className="font-medium">{title}</h2> : <Skeleton className="h-5 w-40" />}
      <Skeleton className={`w-full rounded-lg ${className}`} />
    </section>
  );
}
