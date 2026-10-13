import { cn } from "@/lib/utils";

/**
 * A section title on the page ground: display face over the heavy rule, with
 * an optional small note or link on the right ("all 20", an export link).
 */
export function SectionHeading({
  children,
  aside,
  as: Tag = "h2",
  className,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-rule pb-1.5",
        className,
      )}
    >
      <Tag className={cn("font-display", Tag === "h2" ? "text-2xl" : "text-lg")}>{children}</Tag>
      {aside && <div className="text-[13px] text-muted-foreground">{aside}</div>}
    </div>
  );
}
