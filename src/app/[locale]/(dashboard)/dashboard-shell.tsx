"use client";

import WorkerManagementPage from "@/features/worker/ui/WorkerManagementPage";
import { SchedulerDashboard } from "@/features/scheduler/ui/scheduler-dashboard";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import { useState } from "react";
import { authClient } from "@/features/auth/client";
import { useRouter } from "@/i18n/routing";
import { toast } from "sonner";

export function DashboardShell() {
  const [workersOpen, setWorkersOpen] = useState(false);
  const setWorkers = useSchedulerStore((state) => state.setWorkers);
  const router = useRouter();

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
      onSignOut={signOut}
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
