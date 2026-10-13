import { getOnboardingProgress } from "@/features/organization/server/onboarding";
import { SchedulerDashboard } from "@/features/scheduler/ui/scheduler-dashboard";

export default async function SchedulePage() {
  return <SchedulerDashboard onboarding={await getOnboardingProgress()} />;
}
