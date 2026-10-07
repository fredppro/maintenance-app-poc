import { DashboardShell } from "./dashboard-shell";
import { AppLocale, localeSchema } from "src/i18n/locale";
import { getEquipment, getTasks } from "@/features/scheduler/server/actions";
import { getWorkers } from "@/features/worker/server/actions";
import { SchedulerStoreProvider } from "@/features/scheduler/store/scheduler-provider";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  getAvailableTenantContexts,
  getTenantContext,
  roleCan,
} from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;

  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) {
    notFound();
  }

  setRequestLocale(locale);

  const [equipment, tasks, workers, tenant, tenantContexts] = await Promise.all([
    getEquipment(),
    getTasks(),
    getWorkers(),
    getTenantContext(),
    getAvailableTenantContexts(),
  ]);

  // Capture server-side "now" to sync with client hydration
  const serverNow = new Date();

  return (
    <SchedulerStoreProvider
      initialState={{
        equipment,
        entries: tasks,
        workers,
        sites: tenantContexts
          .filter((c) => c.organizationId === tenant.organizationId)
          .map((c) => ({
            id: c.siteId,
            name: c.siteName,
            current: c.siteId === tenant.siteId,
          })),
        currentDate: serverNow,
      }}
    >
      <DashboardShell
        tenantContexts={tenantContexts}
        selectedSiteId={tenant.siteId}
        canManageMembers={roleCan(tenant.role, "manageMembers")}
      />
    </SchedulerStoreProvider>
  );
}
