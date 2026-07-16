import Link from "next/link";

import { cn } from "@/lib/utils";

interface PresetLinksProps {
  /** Query param name this control sets, e.g. "range" or "asOf". */
  param: string;
  options: readonly { value: string; label: string }[];
  current: string;
  /** Other query params to preserve alongside `param`. */
  baseParams?: Record<string, string | undefined>;
  /** Selecting this value clears `param` entirely rather than setting it (the
   * option that represents "no filter" / the default). */
  clearValue?: string;
}

export function PresetLinks({ param, options, current, baseParams, clearValue }: PresetLinksProps) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      {options.map((o) => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(baseParams ?? {})) {
          if (v) params.set(k, v);
        }
        if (o.value !== clearValue) params.set(param, o.value);
        const query = params.toString();
        return (
          <Link
            key={o.value}
            href={query ? `?${query}` : "?"}
            scroll={false}
            className={cn(
              "rounded-[calc(var(--radius-md)-2px)] px-3 py-1 text-sm transition-colors",
              current === o.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
