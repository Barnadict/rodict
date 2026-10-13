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
    <div className="flex flex-wrap gap-1.5">
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
            aria-current={current === o.value ? "true" : undefined}
            className={cn(
              "rounded-full border-[1.5px] px-3.5 py-1 text-sm font-semibold transition-colors",
              current === o.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
