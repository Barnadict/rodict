import Link from "next/link";
import { LayoutDashboard, Gamepad2, Shapes, TrendingUp, Scale, Bookmark, Info } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const browseItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, color: "text-blue-500" },
  { title: "Games", href: "/games", icon: Gamepad2, color: "text-purple-500" },
  { title: "Genres", href: "/genres", icon: Shapes, color: "text-amber-500" },
  { title: "Trending", href: "/trending", icon: TrendingUp, color: "text-emerald-500" },
  { title: "Saturation", href: "/saturation", icon: Scale, color: "text-rose-500" },
];

const otherItems = [
  { title: "Watchlist", href: "/watchlist", icon: Bookmark },
  { title: "About the data", href: "/about", icon: Info },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md p-2 text-sm font-semibold group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
        >
          <svg
            viewBox="0 0 140 140"
            role="img"
            aria-label="rodict logo"
            className="glow-red size-6 shrink-0 rounded-md"
          >
            <rect width="140" height="140" rx="28" fill="#e2231a" />
            <rect x="32" y="80" width="18" height="40" rx="3" fill="#ffffff" />
            <rect x="61" y="55" width="18" height="65" rx="3" fill="#ffffff" />
            <rect x="90" y="30" width="18" height="90" rx="3" fill="#ffffff" />
          </svg>
          <span className="font-bold group-data-[collapsible=icon]:hidden">
            <span className="text-red-600">ro</span>dict
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Browse</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {browseItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} />} tooltip={item.title}>
                    <item.icon className={item.color} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>More</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {otherItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} />} tooltip={item.title}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
