"use client";

import WorkerManagementPage from "@/features/worker/ui/WorkerManagementPage";
import { SchedulerDashboard } from "@/features/scheduler/ui/scheduler-dashboard";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import { useState } from "react";

export function DashboardShell() {
  const [workersOpen, setWorkersOpen] = useState(false);
  const setWorkers = useSchedulerStore((state) => state.setWorkers);

  return (
    <SchedulerDashboard
      onOpenWorkers={() => setWorkersOpen(true)}
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
