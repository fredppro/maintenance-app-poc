import { beforeEach, describe, expect, it, vi } from "vitest";

const { findTenantSettingsMock } = vi.hoisted(() => ({
  findTenantSettingsMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    tenantSettings: { findUnique: findTenantSettingsMock },
  },
}));

import { requireActiveOrganization } from "./organization-status";

describe("requireActiveOrganization", () => {
  beforeEach(() => {
    findTenantSettingsMock.mockReset();
  });

  it("allows active organizations", async () => {
    findTenantSettingsMock.mockResolvedValue({ status: "ACTIVE" });

    await expect(requireActiveOrganization("org-1")).resolves.toBeUndefined();
    expect(findTenantSettingsMock).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      select: { status: true },
    });
  });

  it("rejects suspended organizations", async () => {
    findTenantSettingsMock.mockResolvedValue({ status: "SUSPENDED" });

    await expect(requireActiveOrganization("org-1")).rejects.toThrow(
      "This organization is not active",
    );
  });

  it("uses the active default when settings are absent", async () => {
    findTenantSettingsMock.mockResolvedValue(null);

    await expect(requireActiveOrganization("org-1")).resolves.toBeUndefined();
  });
});
