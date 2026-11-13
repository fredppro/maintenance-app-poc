"use client";

import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";
import WorkerManagementPage from "@/features/worker/ui/WorkerManagementPage";
import { useLocale } from "next-intl";

export function WorkersPageClient() {
  const setWorkers = useSchedulerStore((s) => s.setWorkers);
  const timeZone = useSchedulerStore((s) => s.timeZone);
  const locale = useLocale();
  return (
    <WorkerManagementPage
      onWorkersChange={setWorkers}
      locale={locale}
      timeZone={timeZone}
    />
  );
}
