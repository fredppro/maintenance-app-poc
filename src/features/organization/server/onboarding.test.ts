import { beforeEach, describe, expect, it, vi } from "vitest";
import { dismissOnboarding, getOnboardingProgress } from "./onboarding";

const mocks = vi.hoisted(() => ({
  getOrganizationContext: vi.fn(),
  settingsFind: vi.fn(),
  settingsUpsert: vi.fn(),
  memberCount: vi.fn(),
  invitationCount: vi.fn(),
  siteCount: vi.fn(),
  equipmentCount: vi.fn(),
  workerCount: vi.fn(),
  taskCount: vi.fn(),
}));

vi.mock("@/lib/tenant-context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/tenant-context")>("@/lib/tenant-context")),
  getOrganizationContext: mocks.getOrganizationContext,
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    tenantSettings: { findUnique: mocks.settingsFind, upsert: mocks.settingsUpsert },
    member: { count: mocks.memberCount },
    invitation: { count: mocks.invitationCount },
  },
}));

const db = {
  site: { count: mocks.siteCount },
  equipment: { count: mocks.equipmentCount },
  worker: { count: mocks.workerCount },
  maintenanceTask: { count: mocks.taskCount },
};

describe("getOnboardingProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationContext.mockResolvedValue({ organizationId: "org-a", db, role: "owner" });
    mocks.settingsFind.mockResolvedValue(null);
    mocks.siteCount.mockResolvedValue(1);
    mocks.equipmentCount.mockResolvedValue(2);
    mocks.workerCount.mockResolvedValue(6);
    mocks.taskCount.mockResolvedValue(3);
    mocks.memberCount.mockResolvedValue(4);
    mocks.invitationCount.mockResolvedValue(5);
  });

  it("returns the organization's counts", async () => {
    expect(await getOnboardingProgress()).toEqual({
      sites: 1,
      equipment: 2,
      workers: 6,
      tasks: 3,
      members: 4,
      invitations: 5,
    });
  });

  it("scopes every count to the active organization", async () => {
    await getOnboardingProgress();

    const scoped = { where: { organizationId: "org-a" } };
    expect(mocks.siteCount).toHaveBeenCalledWith(scoped);
    expect(mocks.equipmentCount).toHaveBeenCalledWith(scoped);
    expect(mocks.workerCount).toHaveBeenCalledWith(scoped);
    expect(mocks.taskCount).toHaveBeenCalledWith(scoped);
    expect(mocks.memberCount).toHaveBeenCalledWith(scoped);
    expect(mocks.settingsFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-a" } }),
    );
    expect(mocks.invitationCount.mock.calls[0][0].where).toMatchObject({ organizationId: "org-a" });
  });

  it("does not count the operator-created owner invitation, but keeps invitations without a role", async () => {
    await getOnboardingProgress();

    expect(mocks.invitationCount.mock.calls[0][0].where).toEqual({
      organizationId: "org-a",
      status: { in: ["pending", "accepted"] },
      OR: [{ role: null }, { role: { not: "owner" } }],
    });
  });

  it("shows nothing to members who cannot manage the organization, without querying", async () => {
    mocks.getOrganizationContext.mockResolvedValue({ organizationId: "org-a", db, role: "read_only" });

    expect(await getOnboardingProgress()).toBeNull();
    expect(mocks.siteCount).not.toHaveBeenCalled();
  });

  it("shows nothing once the organization dismissed the checklist", async () => {
    mocks.settingsFind.mockResolvedValue({ onboardingDismissedAt: new Date() });

    expect(await getOnboardingProgress()).toBeNull();
  });
});

describe("dismissOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationContext.mockResolvedValue({ organizationId: "org-a", db, role: "owner" });
  });

  it("records the dismissal on the active organization only", async () => {
    await dismissOnboarding();

    expect(mocks.getOrganizationContext).toHaveBeenCalledWith("manageOrganization");
    const call = mocks.settingsUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ organizationId: "org-a" });
    expect(call.create).toMatchObject({ organizationId: "org-a" });
    expect(call.update.onboardingDismissedAt).toBeInstanceOf(Date);
  });

  it("is refused when the member may not manage the organization", async () => {
    mocks.getOrganizationContext.mockRejectedValue(new Error("The active role does not allow manageOrganization"));

    await expect(dismissOnboarding()).rejects.toThrow("does not allow");
    expect(mocks.settingsUpsert).not.toHaveBeenCalled();
  });
});
