import { EmptyState } from "@/components/empty-state";

/**
 * The empty state for a time chart that can't draw a line yet: what's missing,
 * and an optional line on when it fills in. Holds the chart's height so the
 * page doesn't jump when data arrives.
 */
export function ChartEmpty({
  title,
  hint,
  height,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  height: number;
}) {
  return <EmptyState title={title} hint={hint} style={{ minHeight: height }} />;
}
