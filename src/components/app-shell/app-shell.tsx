"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import LanguageSwitcher from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { authClient } from "@/features/auth/client";
import {
  TenantContextSelector,
  type TenantContextOption,
} from "@/features/organization/ui/tenant-context-selector";
import { usePathname, useRouter } from "@/i18n/routing";
import { AppSidebar, type AppUser } from "./app-sidebar";
import { findNavItem } from "./nav";

export function AppShell({
  children,
  user,
  tenantContexts,
  selectedSiteId,
  canManageMembers,
  defaultSidebarOpen,
}: {
  children: ReactNode;
  user: AppUser;
  tenantContexts: TenantContextOption[];
  selectedSiteId: string;
  canManageMembers: boolean;
  defaultSidebarOpen: boolean;
}) {
  const t = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const selected = tenantContexts.find((c) => c.siteId === selectedSiteId);

  async function signOut() {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen} className="h-svh">
      <AppSidebar
        user={user}
        canManageMembers={canManageMembers}
        onSignOut={signOut}
        contextLabel={
          selected
            ? `${selected.organizationName} · ${selected.siteName}`
            : t("noContext")
        }
        contextControl={
          tenantContexts.length > 1 ? (
            <TenantContextSelector
              options={tenantContexts}
              selectedSiteId={selectedSiteId}
              label={t("switchContext")}
            />
          ) : undefined
        }
      />
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <SidebarTrigger aria-label={t("toggleSidebar")} />
          <Separator orientation="vertical" className="h-5" />
          {current && (
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="hidden sm:inline-flex">
                  {t(`groups.${current.group.id}`)}
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">
                    {t(`items.${current.item.id}`)}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          )}
          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
