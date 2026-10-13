import { Badge } from "@/components/ui/badge";
import { MetricHelp } from "@/components/metric-help";
import type { GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * A page's one lead number: the figure a reader should leave with, set large in
 * the figure face, with what it counts above it and how far to trust it below.
 * One per page; everything else is a `StatTile`.
 */
export function LeadFigure({
  label,
  value,
  badge,
  help,
  aside,
  note,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** "Est." or "Projection" for a derived figure. */
  badge?: string;
  help?: GlossaryKey;
  /** Sits on the figure's baseline, e.g. a growth badge. */
  aside?: React.ReactNode;
  /** What the figure covers and its limits. */
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {help && <MetricHelp term={help} />}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[clamp(2.75rem,9vw,5rem)] font-figure">{value}</span>
        {badge && <Badge variant="outline">{badge}</Badge>}
        {aside && <span className="text-base">{aside}</span>}
      </div>
      {note && <p className="max-w-[60ch] text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

/** The lead figure with its supporting tiles beside it (below it on a phone). */
export function LeadRow({ lead, children }: { lead: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
      {lead}
      <div className="grid min-w-[min(100%,22rem)] flex-1 grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
        {children}
      </div>
    </div>
  );
}
