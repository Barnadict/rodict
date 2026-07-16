import Link from "next/link";
import {
  LayoutDashboard,
  Gamepad2,
  Shapes,
  TrendingUp,
  Bookmark,
  Info,
} from "lucide-react";

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
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Games", href: "/games", icon: Gamepad2 },
  { title: "Genres", href: "/genres", icon: Shapes },
  { title: "Trending", href: "/trending", icon: TrendingUp },
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
          className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            r
          </span>
          <span className="group-data-[collapsible=icon]:hidden">rodict</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Browse</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {browseItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    tooltip={item.title}
                  >
                    <item.icon />
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
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    tooltip={item.title}
                  >
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
