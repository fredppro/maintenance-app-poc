/** Organization-wide counts that decide which "Getting started" steps are done. */
export type OnboardingProgress = {
  sites: number;
  /** Members, including the owner. */
  members: number;
  /** Non-owner invitations that were sent (pending or accepted). */
  invitations: number;
  equipment: number;
  /** Maintenance tasks need at least one worker, so workers come before the first task. */
  workers: number;
  tasks: number;
};

export type OnboardingStepId = "organization" | "site" | "equipment" | "workers" | "task" | "team";

export type OnboardingStep = { id: OnboardingStepId; done: boolean };

/**
 * Counts the page already holds for the active site. They can be ahead of the
 * server snapshot (something was just added), so a step is done if either says so.
 */
export type LiveOnboardingCounts = { equipment: number; workers: number; tasks: number };

export function buildOnboardingSteps(
  progress: OnboardingProgress,
  live: LiveOnboardingCounts = { equipment: 0, workers: 0, tasks: 0 },
): OnboardingStep[] {
  return [
    { id: "organization", done: true },
    { id: "site", done: progress.sites > 0 },
    { id: "equipment", done: Math.max(progress.equipment, live.equipment) > 0 },
    { id: "workers", done: Math.max(progress.workers, live.workers) > 0 },
    { id: "task", done: Math.max(progress.tasks, live.tasks) > 0 },
    { id: "team", done: progress.members > 1 || progress.invitations > 0 },
  ];
}

export function summarizeOnboarding(steps: OnboardingStep[]) {
  const done = steps.filter((step) => step.done).length;
  return {
    done,
    total: steps.length,
    remaining: steps.length - done,
    complete: done === steps.length,
    percent: Math.round((done / steps.length) * 100),
  };
}
