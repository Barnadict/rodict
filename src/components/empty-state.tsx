import { cn } from "@/lib/utils";

/**
 * What a list, table or chart shows when it has nothing to draw: what is
 * missing, and when or how it fills in. The amber square is the site's mark for
 * thin data; `tone="plain"` drops it for a filter that simply matched nothing.
 */
export function EmptyState({
  title,
  hint,
  action,
  tone = "thin",
  className,
  style,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  /** A link or button that gets the reader out, e.g. "Clear filters". */
  action?: React.ReactNode;
  tone?: "thin" | "plain";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("flex flex-col justify-center gap-1.5 border-y py-8", className)}
      style={style}
    >
      <p className="flex items-center gap-2 font-semibold text-foreground">
        {tone === "thin" && (
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px] bg-warn" />
        )}
        {title}
      </p>
      {hint && <p className="max-w-prose text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
