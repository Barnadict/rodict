import Link from "next/link";

import { GameIcon } from "@/components/game-icon";
import { cn } from "@/lib/utils";

export interface MobileCard {
  key: string;
  href?: string;
  title: React.ReactNode;
  /** Small line under the title (genre chip, creator…). */
  subtitle?: React.ReactNode;
  /** Icon URL; `undefined` leaves the icon slot out, `null` shows the fallback. */
  icon?: string | null;
  rank?: number;
  /** Two or three key stats. */
  stats: { label: string; value: React.ReactNode }[];
  /** Right-hand extra, e.g. a sparkline or growth badge. */
  aside?: React.ReactNode;
}

/**
 * The phone layout of a wide table (Task #104): below `sm` each row becomes a
 * stacked card instead of a table that scrolls sideways. Pages render this
 * next to the table and hide the table below `sm` (`hidden sm:block`).
 */
export function MobileCards({
  items,
  empty = "Nothing to show.",
  className,
}: {
  items: MobileCard[];
  empty?: React.ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col divide-y rounded-lg border sm:hidden", className)}>
      {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">{empty}</li>}
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-3 p-3">
          {item.rank !== undefined && (
            <span className="w-5 shrink-0 pt-0.5 text-right text-xs text-muted-foreground tabular-nums">
              {item.rank}
            </span>
          )}
          {item.icon !== undefined && <GameIcon src={item.icon} size={40} />}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                {item.href ? (
                  <Link href={item.href} className="line-clamp-2 font-medium hover:underline">
                    {item.title}
                  </Link>
                ) : (
                  <span className="line-clamp-2 font-medium">{item.title}</span>
                )}
                {item.subtitle && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {item.subtitle}
                  </div>
                )}
              </div>
              {item.aside && <div className="shrink-0">{item.aside}</div>}
            </div>
            <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              {item.stats.map((s) => (
                <div key={s.label} className="flex gap-1">
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="font-medium tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}
