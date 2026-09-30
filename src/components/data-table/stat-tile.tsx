import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { MetricHelp } from "@/components/metric-help";
import type { GlossaryKey } from "@/lib/glossary";

export function StatTile({
  label,
  value,
  badge,
  hint,
  help,
}: {
  label: string;
  value: ReactNode;
  badge?: string;
  /** A short muted line under the value, e.g. what a count means. */
  hint?: ReactNode;
  /** Glossary entry for a derived stat: shows a "?" with its definition (Task #112). */
  help?: GlossaryKey;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {help && <MetricHelp term={help} />}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {badge && (
          <Badge variant="outline" className="text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
