import { Suspense } from "react";

import { CommandSearch } from "@/components/layout/command-search";
import { SiteNav, SiteNavLive } from "@/components/layout/site-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * The top bar: logo, grouped menus, search and the theme switch. It is an ink
 * surface, so it stays navy in the light theme. Its height (`h-14`) is what
 * sticky table heads sit under (`xl:top-14` in ui/table.tsx).
 */
export function SiteHeader() {
  return (
    <header className="surface-ink sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 bg-bar px-4 text-foreground md:px-6">
      <Suspense fallback={<SiteNav pathname={null} />}>
        <SiteNavLive />
      </Suspense>
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5">
        <CommandSearch />
        <ThemeToggle />
      </div>
    </header>
  );
}
