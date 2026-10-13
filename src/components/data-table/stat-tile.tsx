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
    <div className="border-t-2 border-rule pt-2.5">
      <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
        {label}
        {help && <MetricHelp term={help} />}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[1.75rem] font-figure">{value}</span>
        {badge && (
          <Badge variant="outline" className="text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
