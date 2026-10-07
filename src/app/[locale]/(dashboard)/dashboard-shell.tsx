"use client";

import WorkerManagementPage from "@/features/worker/ui/WorkerManagementPage";
import { SchedulerDashboard } from "@/features/scheduler/ui/scheduler-dashboard";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import { useEffect, useState } from "react";
import { authClient } from "@/features/auth/client";
import { useRouter } from "@/i18n/routing";
import { toast } from "sonner";
import type { TenantContextOption } from "@/features/organization/ui/tenant-context-selector";
import { TenantContextSelector } from "@/features/organization/ui/tenant-context-selector";

export function DashboardShell({
  tenantContexts,
  selectedSiteId,
  canManageMembers,
}: {
  tenantContexts: TenantContextOption[];
  selectedSiteId: string;
  canManageMembers: boolean;
}) {
  const [workersOpen, setWorkersOpen] = useState(false);
  const setWorkers = useSchedulerStore((state) => state.setWorkers);
  const workersViewRequest = useSchedulerStore(
    (state) => state.workersViewRequest,
  );
  const router = useRouter();

  useEffect(() => {
    if (workersViewRequest > 0) setWorkersOpen(true);
  }, [workersViewRequest]);

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
    <SchedulerDashboard
      onOpenWorkers={() => setWorkersOpen(true)}
      onOpenMembers={canManageMembers ? () => router.push("/members") : undefined}
      onSignOut={signOut}
      tenantContextControl={
        tenantContexts.length > 1 ? (
          <TenantContextSelector
            options={tenantContexts}
            selectedSiteId={selectedSiteId}
            label="Organization and site"
          />
        ) : undefined
      }
      workersContent={
        workersOpen ? (
          <WorkerManagementPage
            onBack={() => setWorkersOpen(false)}
            onWorkersChange={setWorkers}
          />
        ) : undefined
      }
    />
  );
}
