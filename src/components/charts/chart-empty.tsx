import { LineChart as LineChartIcon } from "lucide-react";

/**
 * The empty state for a time chart that can't draw a line yet (Task #109):
 * an icon, what's missing, and an optional line on when it fills in.
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
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-6 text-center"
      style={{ minHeight: height }}
    >
      <LineChartIcon className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
