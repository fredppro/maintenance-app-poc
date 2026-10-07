import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/app-shell/app-shell";
import {
  getEquipment,
  getSections,
  getTasks,
} from "@/features/scheduler/server/actions";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import { getWorkers } from "@/features/worker/server/actions";
import prisma from "@/lib/prisma";
import {
  getAvailableTenantContexts,
  getTenantContext,
  roleCan,
} from "@/lib/tenant-context";
import { localeSchema } from "src/i18n/locale";

export const dynamic = "force-dynamic";

/**
 * Application shell: sidebar navigation plus one tenant-scoped data store
 * shared by every page (schedule, equipment, sites, workers, inventory, metrics).
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!localeSchema.safeParse(locale).success) notFound();
  setRequestLocale(locale);

  const [equipment, sections, tasks, workers, tenant, tenantContexts, cookieStore] =
    await Promise.all([
      getEquipment(),
      getSections(),
      getTasks(),
      getWorkers(),
      getTenantContext(),
      getAvailableTenantContexts(),
      cookies(),
    ]);
  const user = await prisma.user.findUnique({
    where: { id: tenant.userId },
    select: { name: true, email: true },
  });

  return (
    <SchedulerStoreProvider
      key={`${tenant.organizationId}:${tenant.siteId}`}
      initialState={{
        equipment,
        sections,
        entries: tasks,
        workers,
        sites: tenantContexts
          .filter((c) => c.organizationId === tenant.organizationId)
          .map((c) => ({
            id: c.siteId,
            name: c.siteName,
            current: c.siteId === tenant.siteId,
          })),
        currentDate: new Date(),
      }}
    >
      <AppShell
        user={{ name: user?.name ?? "", email: user?.email ?? "" }}
        tenantContexts={tenantContexts}
        selectedSiteId={tenant.siteId}
        canManageMembers={roleCan(tenant.role, "manageMembers")}
        defaultSidebarOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      >
        {children}
      </AppShell>
    </SchedulerStoreProvider>
  );
}
