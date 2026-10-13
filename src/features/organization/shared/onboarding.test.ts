import { describe, expect, it } from "vitest";
import {
  buildOnboardingSteps,
  summarizeOnboarding,
  type OnboardingProgress,
} from "./onboarding";

const empty: OnboardingProgress = { sites: 0, members: 1, invitations: 0, equipment: 0, workers: 0, tasks: 0 };
const remaining = (progress: OnboardingProgress, live?: { equipment: number; workers: number; tasks: number }) =>
  buildOnboardingSteps(progress, live)
    .filter((step) => !step.done)
    .map((step) => step.id);

describe("onboarding steps", () => {
  it("always counts the organization itself as done", () => {
    expect(buildOnboardingSteps(empty)[0]).toEqual({ id: "organization", done: true });
  });

  it("a newly provisioned organization (one site, only the owner) has four steps left", () => {
    expect(remaining({ ...empty, sites: 1 })).toEqual(["equipment", "workers", "task", "team"]);
  });

  it("handles an organization without any site", () => {
    expect(remaining(empty)).toEqual(["site", "equipment", "workers", "task", "team"]);
  });

  it("marks the team step done by an additional member or by a sent invitation", () => {
    expect(remaining({ ...empty, sites: 1, members: 2 })).not.toContain("team");
    expect(remaining({ ...empty, sites: 1, invitations: 1 })).not.toContain("team");
    expect(remaining({ ...empty, sites: 1, members: 1, invitations: 0 })).toContain("team");
  });

  it("handles equipment without extra members, and members without equipment", () => {
    expect(remaining({ sites: 1, members: 1, invitations: 0, equipment: 4, workers: 0, tasks: 0 })).toEqual([
      "workers",
      "task",
      "team",
    ]);
    expect(remaining({ sites: 1, members: 3, invitations: 0, equipment: 0, workers: 0, tasks: 0 })).toEqual([
      "equipment",
      "workers",
      "task",
    ]);
  });

  it("treats an organization that already has tasks as past the equipment and task steps", () => {
    expect(remaining({ sites: 2, members: 1, invitations: 0, equipment: 5, workers: 2, tasks: 9 })).toEqual(["team"]);
  });

  it("lets what the page just created complete a step before the server snapshot catches up", () => {
    const progress = { ...empty, sites: 1 };
    expect(remaining(progress, { equipment: 1, workers: 0, tasks: 0 })).toEqual(["workers", "task", "team"]);
    expect(remaining(progress, { equipment: 1, workers: 1, tasks: 1 })).toEqual(["team"]);
  });

  it("reports a fully configured organization as complete", () => {
    const steps = buildOnboardingSteps({ sites: 1, members: 2, invitations: 0, equipment: 1, workers: 1, tasks: 1 });
    expect(summarizeOnboarding(steps)).toEqual({
      done: 6,
      total: 6,
      remaining: 0,
      complete: true,
      percent: 100,
    });
  });

  it("summarizes partial progress", () => {
    const summary = summarizeOnboarding(buildOnboardingSteps({ ...empty, sites: 1 }));
    expect(summary).toMatchObject({ done: 2, remaining: 4, complete: false, percent: 33 });
  });
});
