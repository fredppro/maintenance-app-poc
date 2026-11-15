import { getOnboardingProgress } from "@/features/organization/server/onboarding";
import { SchedulerDashboard } from "@/features/scheduler/ui/scheduler-dashboard";
import { PageViewTransition } from "@/components/app-shell/page-view-transition";

export default async function SchedulePage() {
  return (
    <PageViewTransition>
      <SchedulerDashboard onboarding={await getOnboardingProgress()} />
    </PageViewTransition>
  );
}
