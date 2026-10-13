"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  NAV_GROUPS,
  REFERENCE_ITEMS,
  WATCHLIST_ITEM,
  isActivePath,
  type NavGroup,
} from "@/lib/nav";
import { cn } from "@/lib/utils";

/** A top-bar entry: full bar height, with the blue rule under the active one. */
const BAR_ITEM =
  "inline-flex h-14 items-center gap-1 border-y-[3px] border-transparent px-0.5 text-[15px] whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline aria-expanded:text-foreground";
const BAR_ITEM_ACTIVE = "border-b-primary font-bold text-foreground";

function GroupMenu({ group, pathname }: { group: NavGroup; pathname: string | null }) {
  const active = group.items.some((item) => isActivePath(pathname, item.href));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(BAR_ITEM, active && BAR_ITEM_ACTIVE)}>
        {group.title}
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={0} className="surface-ink w-72 rounded-t-none p-1.5">
        {group.items.map((item) => {
          const current = isActivePath(pathname, item.href);
          return (
            <DropdownMenuItem
              key={item.href}
              render={<Link href={item.href} aria-current={current ? "page" : undefined} />}
              className="flex-col items-start gap-0 px-2.5 py-2"
            >
              <span className={cn("font-semibold", current && "text-link")}>{item.title}</span>
              <span className="text-[13px] text-muted-foreground">{item.description}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The phone and tablet menu: every group in one sheet. */
function MobileMenu({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = React.useState(false);
  const groups: NavGroup[] = [
    ...NAV_GROUPS,
    { title: "Yours", items: [WATCHLIST_ITEM] },
    { title: "Reference", items: REFERENCE_ITEMS },
  ];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="-ml-1.5 lg:hidden" />}
        aria-label="Open menu"
      >
        <Menu aria-hidden="true" className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="surface-ink gap-0 overflow-y-auto bg-bar">
        <SheetHeader className="border-b">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Link href="/" onClick={() => setOpen(false)} aria-label="rodict home" className="w-fit">
            <Logo />
          </Link>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-col gap-5 p-4">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col">
              <h2 className="border-b-2 border-rule pb-1 text-lg font-display">{group.title}</h2>
              <ul>
                {group.items.map((item) => {
                  const current = isActivePath(pathname, item.href);
                  return (
                    <li key={item.href} className="border-b">
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center text-base text-muted-foreground",
                          current && "font-bold text-foreground",
                        )}
                      >
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The left of the top bar: phone menu, logo and the grouped menus. `pathname`
 * is null while it isn't known yet (see `SiteNavLive`); nothing is marked
 * active then.
 */
export function SiteNav({ pathname }: { pathname: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3 lg:gap-7">
      <MobileMenu pathname={pathname} />
      <Link href="/" aria-label="rodict home" className="shrink-0 rounded-sm">
        <Logo />
      </Link>
      <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
        {NAV_GROUPS.map((group) => (
          <GroupMenu key={group.title} group={group} pathname={pathname} />
        ))}
        <Link
          href={WATCHLIST_ITEM.href}
          aria-current={isActivePath(pathname, WATCHLIST_ITEM.href) ? "page" : undefined}
          className={cn(BAR_ITEM, isActivePath(pathname, WATCHLIST_ITEM.href) && BAR_ITEM_ACTIVE)}
        >
          {WATCHLIST_ITEM.title}
        </Link>
      </nav>
    </div>
  );
}

/**
 * Reads the pathname to mark the current section. Kept apart so the header can
 * wrap it in Suspense: with Cache Components, `usePathname` on a route with a
 * dynamic param would otherwise hold back the static shell.
 */
export function SiteNavLive() {
  return <SiteNav pathname={usePathname()} />;
}
