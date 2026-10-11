import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import messages from "@/i18n/messages/en.json";
import type { OnboardingProgress } from "@/features/organization/shared/onboarding";
import { SchedulerStoreProvider } from "../store/scheduler-provider";
import type { Equipment, Worker } from "../types";
import { GettingStarted } from "./getting-started";

const { dismissMock } = vi.hoisted(() => ({ dismissMock: vi.fn() }));

vi.mock("@/features/organization/server/onboarding", () => ({ dismissOnboarding: dismissMock }));
vi.mock("../server/actions", () => ({
  createTask: vi.fn(),
  addEquipment: vi.fn(),
  updateEquipment: vi.fn(),
  relocateEquipment: vi.fn(),
  getEquipmentRelocations: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const lathe: Equipment = {
  id: "equipment-1",
  name: "Workshop Lathe",
  category: "Tools",
  imageFileId: null,
  sectionId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const taylor: Worker = {
  id: "worker-1",
  name: "Taylor Worker",
  email: "taylor@example.test",
  phone: null,
  type: "INTERNAL",
  vendorId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const provisioned: OnboardingProgress = { sites: 1, members: 1, invitations: 0, equipment: 0, workers: 0, tasks: 0 };

function renderChecklist(progress: OnboardingProgress, equipment: Equipment[] = [], workers: Worker[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchedulerStoreProvider initialState={{ equipment, workers }}>
        <GettingStarted progress={progress} />
      </SchedulerStoreProvider>
    </NextIntlClientProvider>,
  );
}

describe("GettingStarted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dismissMock.mockResolvedValue(undefined);
  });

  it("shows a newly provisioned organization what is left, with a direct action for each step", () => {
    renderChecklist(provisioned);

    const checklist = screen.getByRole("region", { name: "Getting started" });
    expect(within(checklist).getByText("4 steps remaining")).toBeInTheDocument();
    expect(within(checklist).getByRole("button", { name: "Add equipment" })).toBeEnabled();
    expect(within(checklist).getByRole("link", { name: "Add workers" })).toHaveAttribute("href", "/workers");
    expect(within(checklist).getByRole("link", { name: "Invite team" })).toHaveAttribute("href", "/members");
    expect(within(checklist).getByText("Organization set up")).toBeInTheDocument();
    expect(within(checklist).getByText("First site added")).toBeInTheDocument();
  });

  it("sends an organization without a site to the sites page", () => {
    renderChecklist({ ...provisioned, sites: 0 });

    expect(screen.getByText("5 steps remaining")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add site" })).toHaveAttribute("href", "/sites");
  });

  it("only offers to schedule maintenance once there is equipment and a worker to assign", () => {
    const first = renderChecklist(provisioned);
    expect(screen.getByRole("button", { name: "Schedule maintenance" })).toBeDisabled();
    expect(
      screen.getByText("Add equipment and at least one worker first, then schedule maintenance."),
    ).toBeInTheDocument();
    first.unmount();

    const equipmentOnly = renderChecklist({ ...provisioned, equipment: 1 }, [lathe]);
    expect(screen.getByRole("button", { name: "Schedule maintenance" })).toBeDisabled();
    equipmentOnly.unmount();

    renderChecklist({ ...provisioned, equipment: 1, workers: 1 }, [lathe], [taylor]);
    expect(screen.getByRole("button", { name: "Schedule maintenance" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Add equipment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add workers" })).not.toBeInTheDocument();
  });

  it("counts equipment the page already holds before the server snapshot catches up", () => {
    renderChecklist(provisioned, [lathe]);

    expect(screen.getByText("3 steps remaining")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add equipment" })).not.toBeInTheDocument();
    expect(screen.getByText("Equipment added")).toBeInTheDocument();
  });

  it("shows the completed state for a fully configured organization and lets the user dismiss it", async () => {
    const user = userEvent.setup();
    renderChecklist({ sites: 1, members: 2, invitations: 0, equipment: 3, workers: 2, tasks: 4 }, [lathe]);

    expect(screen.getByText("You're all set")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Invite team" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismissMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument();
  });

  it("collapses and expands without dismissing", async () => {
    const user = userEvent.setup();
    renderChecklist(provisioned);

    await user.click(screen.getByRole("button", { name: "Collapse getting started" }));
    expect(screen.queryByRole("button", { name: "Add equipment" })).not.toBeInTheDocument();
    expect(screen.getByText("4 steps remaining")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand getting started" }));
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeInTheDocument();
    expect(dismissMock).not.toHaveBeenCalled();
  });

  it("hides an unfinished checklist for the organization on request, and restores it if saving fails", async () => {
    const user = userEvent.setup();
    dismissMock.mockRejectedValueOnce(new Error("offline"));
    renderChecklist(provisioned);

    await user.click(screen.getByRole("button", { name: "Hide getting started" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not hide the checklist. Please try again."));
    expect(screen.getByRole("region", { name: "Getting started" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide getting started" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Getting started" })).not.toBeInTheDocument());
  });
});
