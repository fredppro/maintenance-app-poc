import {
  BarChart3,
  CalendarDays,
  MapPin,
  Package,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  id: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the user may manage organization members. */
  requiresMemberAdmin?: boolean;
};

export type NavGroup = { id: string; items: NavItem[] };

/**
 * Single source of truth for primary navigation. Labels live under
 * `Nav.items.<id>` and `Nav.groups.<id>` in the locale files.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "operations",
    items: [
      { id: "schedule", href: "/", icon: CalendarDays },
      { id: "metrics", href: "/metrics", icon: BarChart3 },
    ],
  },
  {
    id: "assets",
    items: [
      { id: "equipment", href: "/equipment", icon: Wrench },
      { id: "sites", href: "/sites", icon: MapPin },
      { id: "inventory", href: "/inventory", icon: Package },
    ],
  },
  {
    id: "people",
    items: [
      { id: "workers", href: "/workers", icon: Users },
      {
        id: "members",
        href: "/members",
        icon: UserCog,
        requiresMemberAdmin: true,
      },
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string) {
  return item.href === "/"
    ? pathname === "/"
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function findNavItem(pathname: string) {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => isNavItemActive(i, pathname));
    if (item) return { group, item };
  }
  return null;
}
