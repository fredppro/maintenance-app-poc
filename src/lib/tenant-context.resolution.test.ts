import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  cookieGet: vi.fn(),
  memberFindFirst: vi.fn(),
  settingsFindUnique: vi.fn(),
  siteFindMany: vi.fn(),
  forTenant: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: mocks.cookieGet, set: vi.fn() }),
}));
vi.mock("@/features/auth/server/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    member: { findFirst: mocks.memberFindFirst, findMany: vi.fn() },
    tenantSettings: { findUnique: mocks.settingsFindUnique },
  },
  forTenant: mocks.forTenant,
}));

import {
  AuthenticationRequiredError,
  OrganizationRequiredError,
  PermissionDeniedError,
  SiteSelectionRequiredError,
  SiteSetupRequiredError,
  TenantInactiveError,
  getOrganizationContext,
  getTenantContext,
} from "./tenant-context";

const session = (activeOrganizationId: string | null = "org-1") => ({
  user: { id: "user-1" },
  session: { activeOrganizationId },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session());
  mocks.memberFindFirst.mockResolvedValue({ role: "admin" });
  mocks.settingsFindUnique.mockResolvedValue({ status: "ACTIVE" });
  mocks.siteFindMany.mockResolvedValue([{ id: "site-a", name: "A" }]);
  mocks.forTenant.mockImplementation((organizationId: string) => ({
    organizationId,
    site: { findMany: mocks.siteFindMany },
  }));
  mocks.cookieGet.mockReturnValue(undefined);
});

describe("getOrganizationContext", () => {
  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(getOrganizationContext()).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(mocks.memberFindFirst).not.toHaveBeenCalled();
  });

  it("requires an active organization", async () => {
    mocks.getSession.mockResolvedValue(session(null));
    await expect(getOrganizationContext()).rejects.toBeInstanceOf(OrganizationRequiredError);
    expect(mocks.memberFindFirst).not.toHaveBeenCalled();
  });

  it("requires the user to be a member of the active organization", async () => {
    mocks.memberFindFirst.mockResolvedValue(null);
    await expect(getOrganizationContext()).rejects.toBeInstanceOf(OrganizationRequiredError);
    expect(mocks.memberFindFirst).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: "user-1" },
      select: { role: true },
    });
  });

  it.each(["SUSPENDED", "PENDING_DELETION"])("blocks a %s organization", async (status) => {
    mocks.settingsFindUnique.mockResolvedValue({ status });
    await expect(getOrganizationContext()).rejects.toMatchObject({
      name: "TenantInactiveError",
      status,
    });
    await expect(getOrganizationContext()).rejects.toBeInstanceOf(TenantInactiveError);
  });

  it("treats an organization without settings as active", async () => {
    mocks.settingsFindUnique.mockResolvedValue(null);
    await expect(getOrganizationContext()).resolves.toMatchObject({ organizationId: "org-1" });
  });

  it("denies a permission the role does not hold, even for a member", async () => {
    mocks.memberFindFirst.mockResolvedValue({ role: "read_only" });
    await expect(getOrganizationContext("manageMaintenance")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
    await expect(getOrganizationContext("viewMaintenance")).resolves.toMatchObject({
      role: "read_only",
    });
  });

  it("scopes the returned client to the session's organization, never to caller input", async () => {
    const context = await getOrganizationContext("manageSites");
    expect(mocks.forTenant).toHaveBeenCalledWith("org-1");
    expect(context).toMatchObject({ userId: "user-1", organizationId: "org-1", role: "admin" });
  });
});

describe("getTenantContext", () => {
  it("rejects an organization without sites", async () => {
    mocks.siteFindMany.mockResolvedValue([]);
    await expect(getTenantContext()).rejects.toBeInstanceOf(SiteSetupRequiredError);
  });

  it("selects the only site without a cookie", async () => {
    await expect(getTenantContext()).resolves.toMatchObject({ siteId: "site-a", siteName: "A" });
  });

  it("selects the site named by the cookie when there are several", async () => {
    mocks.siteFindMany.mockResolvedValue([
      { id: "site-a", name: "A" },
      { id: "site-b", name: "B" },
    ]);
    mocks.cookieGet.mockReturnValue({ value: "site-b" });
    await expect(getTenantContext()).resolves.toMatchObject({ siteId: "site-b", siteName: "B" });
  });

  it("requires a choice when there are several sites and no cookie", async () => {
    mocks.siteFindMany.mockResolvedValue([
      { id: "site-a", name: "A" },
      { id: "site-b", name: "B" },
    ]);
    await expect(getTenantContext()).rejects.toBeInstanceOf(SiteSelectionRequiredError);
  });

  it("ignores a cookie naming a site of another organization", async () => {
    mocks.siteFindMany.mockResolvedValue([
      { id: "site-a", name: "A" },
      { id: "site-b", name: "B" },
    ]);
    mocks.cookieGet.mockReturnValue({ value: "foreign-site" });
    await expect(getTenantContext()).rejects.toBeInstanceOf(SiteSelectionRequiredError);
  });

  it("falls back to the single site when the cookie is stale", async () => {
    mocks.cookieGet.mockReturnValue({ value: "deleted-site" });
    await expect(getTenantContext()).resolves.toMatchObject({ siteId: "site-a" });
  });

  it("still enforces the requested permission", async () => {
    mocks.memberFindFirst.mockResolvedValue({ role: "member" });
    await expect(getTenantContext("manageWorkers")).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(mocks.siteFindMany).not.toHaveBeenCalled();
  });

  it("reads sites only for the active organization", async () => {
    await getTenantContext();
    expect(mocks.siteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });
});
