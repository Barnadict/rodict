/**
 * The site's navigation, in one place: the top bar's grouped menus, the phone
 * menu and the footer all read this. Grouped by what a developer came to do.
 */

export interface NavItem {
  title: string;
  href: string;
  /** One line on what the page answers, shown in the menus. */
  description: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Home", href: "/", description: "The current charts at a glance" },
      { title: "Market", href: "/market", description: "Total players across tracked games" },
      { title: "Weekly recap", href: "/weekly", description: "What moved in the last seven days" },
    ],
  },
  {
    title: "Explore",
    items: [
      { title: "Games", href: "/games", description: "Every tracked game, sortable" },
      { title: "Genres", href: "/genres", description: "Twenty gameplay genres compared" },
      { title: "Themes", href: "/themes", description: "Settings and subjects across genres" },
      { title: "Creators", href: "/creators", description: "Studios and developers by reach" },
    ],
  },
  {
    title: "What's changing",
    items: [
      { title: "Trending", href: "/trending", description: "Games gaining or losing players" },
      { title: "New releases", href: "/new", description: "Recent launches and how they started" },
      { title: "Updates", href: "/updates", description: "Game updates and what followed" },
      { title: "Records", href: "/records", description: "Peaks and all-time highs" },
      { title: "Graveyard", href: "/graveyard", description: "Games that died, and when" },
    ],
  },
  {
    title: "Research",
    items: [
      { title: "Saturation", href: "/saturation", description: "How crowded each genre is" },
      {
        title: "Niche finder",
        href: "/opportunities",
        description: "Genres and themes by opportunity score",
      },
      { title: "Compare", href: "/compare", description: "Games or genres side by side" },
    ],
  },
];

/** A single link in the top bar, not a menu. */
export const WATCHLIST_ITEM: NavItem = {
  title: "Watchlist",
  href: "/watchlist",
  description: "Games and genres you follow, kept in this browser",
};

/** Reference pages live in the footer. */
export const REFERENCE_ITEMS: NavItem[] = [
  { title: "About the data", href: "/about", description: "The method and every assumption" },
  { title: "API and feeds", href: "/api-docs", description: "Exports, Atom feeds and the badge" },
  { title: "Status", href: "/status", description: "Collection runs and their history" },
];

/** Whether `pathname` is `href` or a page under it. Home matches only itself. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
