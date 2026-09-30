import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The one page header every page uses (Task #108): an optional breadcrumb
 * trail, the title, a description and actions on the right. `children` sits
 * under the description for page-specific notes. Breadcrumbs list the pages
 * above this one; the current page is added from `crumb` (or the title).
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  crumb,
  icon,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  /** Label for the current page in the trail, when the title isn't plain text. */
  crumb?: string;
  /** Shown left of the title, e.g. a game's icon. */
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const current = crumb ?? (typeof title === "string" ? title : undefined);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((c) => (
              <li key={`${c.label}-${c.href}`} className="inline-flex items-center gap-1">
                {c.href ? (
                  <Link href={c.href} className="hover:text-foreground hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span>{c.label}</span>
                )}
                <ChevronRight aria-hidden="true" className="size-3.5" />
              </li>
            ))}
            {current && (
              <li aria-current="page" className="max-w-64 truncate text-foreground">
                {current}
              </li>
            )}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight wrap-break-word">{title}</h1>
            {description && <div className="max-w-3xl text-muted-foreground">{description}</div>}
            {children}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
