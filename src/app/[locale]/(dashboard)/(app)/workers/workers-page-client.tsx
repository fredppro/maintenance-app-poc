"use client";

import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import WorkerManagementPage from "@/features/worker/ui/WorkerManagementPage";

export function WorkersPageClient() {
  const setWorkers = useSchedulerStore((s) => s.setWorkers);
  return (
    <div className="mx-auto w-full max-w-6xl p-3 sm:p-6">
      <WorkerManagementPage onWorkersChange={setWorkers} />
    </div>
  );
}
