import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export function StatTile({
  label,
  value,
  badge,
  hint,
}: {
  label: string;
  value: ReactNode;
  badge?: string;
  /** A short muted line under the value, e.g. what a count means. */
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
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
