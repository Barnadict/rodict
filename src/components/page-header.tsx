import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/** Title size steps down as the title gets longer (game names run long). */
function titleSize(title: React.ReactNode): { size: string; long: boolean } {
  const length = typeof title === "string" ? title.length : 28;
  if (length <= 22) return { size: "text-[clamp(2.5rem,6vw,4.5rem)]", long: false };
  if (length <= 40) return { size: "text-[clamp(2rem,4.5vw,3.25rem)]", long: true };
  return { size: "text-[clamp(1.625rem,3.5vw,2.5rem)]", long: true };
}

/**
 * The one page header every page uses: an optional breadcrumb trail, the title
 * in the display face, a description and actions on the right, on an ink band
 * (navy in both themes, like the top bar) over the heavy rule. `children` sits
 * under the description for
 * page-specific notes. Breadcrumbs list the pages above this one; the current
 * page is added from `crumb` (or the title).
 *
 * The band pulls out of the page's `p-6` wrapper (`page-band`), so it must be
 * that wrapper's first child.
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
  const { size, long } = titleSize(title);
  return (
    <header
      className={cn(
        "surface-ink page-band flex flex-col gap-3 border-b-2 border-rule bg-band px-6 py-5 text-foreground md:py-6",
        className,
      )}
    >
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
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          {icon}
          {/* A short title shares its line with the description on wide
              screens; a long one keeps the line to itself. */}
          <div
            className={cn(
              "flex min-w-0 flex-col gap-x-9 gap-y-2.5",
              !long && "lg:flex-row lg:items-end",
            )}
          >
            <h1 className={cn("text-balance wrap-break-word font-display", size)}>{title}</h1>
            {(description || children) && (
              <div className={cn("flex flex-col gap-1.5", long ? "max-w-3xl" : "max-w-md")}>
                {description && <div className="text-muted-foreground">{description}</div>}
                {children}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** The band's placeholder for route `loading.tsx` files. */
export function PageHeaderSkeleton() {
  return (
    <div className="surface-ink page-band flex flex-col gap-3 border-b-2 border-rule bg-band px-6 py-5 text-foreground md:py-6">
      <Skeleton className="h-11 w-56 max-w-full md:h-16" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}
