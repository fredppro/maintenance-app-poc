"use client";

import { ChevronsUpDown, CircleUserRound, LogOut, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { useId } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/routing";
import { motionTransitions } from "@/lib/motion";
import { isNavItemActive, NAV_GROUPS } from "./nav";

export type AppUser = { name: string; email: string };

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function AppSidebar({
  user,
  canManageMembers,
  logo,
  onAccount,
  onSignOut,
}: {
  user: AppUser;
  canManageMembers: boolean;
  /** Organization logo shown in place of the default mark. */
  logo?: { src: string; alt: string };
  onAccount: () => void;
  onSignOut: () => void;
}) {
  const t = useTranslations("Nav");
  const tDashboard = useTranslations("Dashboard");
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const userMenuAvatarId = useId();
  const userMenuNameId = useId();
  const userMenuEmailId = useId();
  const userMenuLabelId = useId();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <div className="flex items-center gap-2 px-1 pt-1">
          {logo ? (
            <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-accent">
              {/* Same-origin, authenticated file; next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.src} alt={logo.alt} className="size-full object-contain" />
            </div>
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="size-4" aria-hidden="true" />
            </div>
          )}
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {tDashboard("title")}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(
            (item) => !item.requiresMemberAdmin || canManageMembers,
          );
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{t(`groups.${group.id}`)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const label = t(`items.${item.id}`);
                    const active = isNavItemActive(item, pathname);
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          className="relative data-[active=true]:bg-transparent"
                          tooltip={label}
                        >
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            onClick={() => isMobile && setOpenMobile(false)}
                          >
                            {active && (
                              <motion.span
                                aria-hidden="true"
                                data-slot="sidebar-active-indicator"
                                layoutId="sidebar-active-indicator"
                                initial={false}
                                transition={motionTransitions.indicator}
                                className="pointer-events-none absolute inset-0 z-0 rounded-md bg-sidebar-accent"
                              />
                            )}
                            <item.icon className="relative z-10" aria-hidden="true" />
                            <span className="relative z-10">{label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  aria-labelledby={`${userMenuAvatarId} ${userMenuNameId} ${userMenuEmailId} ${userMenuLabelId}`}
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback id={userMenuAvatarId} className="rounded-lg">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span id={userMenuNameId} className="truncate font-medium">{user.name}</span>
                    <span id={userMenuEmailId} className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </span>
                  <span id={userMenuLabelId} className="sr-only">
                    {tDashboard("menu.userMenu")}
                  </span>
                  <ChevronsUpDown className="ml-auto" aria-hidden="true" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "top" : "right"}
                align="end"
                className="min-w-56"
              >
                <DropdownMenuLabel className="font-normal">
                  <span className="block truncate text-sm font-medium">
                    {user.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onAccount}>
                  <CircleUserRound aria-hidden="true" />
                  {tDashboard("menu.account")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSignOut} variant="destructive">
                  <LogOut aria-hidden="true" />
                  {tDashboard("menu.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
