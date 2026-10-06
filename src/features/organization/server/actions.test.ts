import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import {
  createInitialSite,
  switchActiveOrganization,
  switchTenantContext,
} from "./actions";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  setActiveOrganization: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}));

vi.mock("@/features/auth/server/auth", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      setActiveOrganization: mocks.setActiveOrganization,
    },
  },
}));

describe("organization context actions", () => {
  beforeEach(() => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.cookies.mockResolvedValue({
      set: mocks.setCookie,
      delete: mocks.deleteCookie,
    });
    mocks.getSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mocks.getSession.mockClear();
    mocks.setActiveOrganization.mockResolvedValue({ session: {} });
    mocks.setActiveOrganization.mockClear();
    mocks.setCookie.mockClear();
    mocks.deleteCookie.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a site not belonging to a member's selected organization", async () => {
    vi.spyOn(prisma.member, "findFirst").mockResolvedValue(null);
    vi.spyOn(prisma.site, "findFirst").mockResolvedValue({ id: "site-b" } as never);

    await expect(
      switchTenantContext({ organizationId: "org-b", siteId: "site-b" }),
    ).rejects.toThrow("not accessible");

    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: { organizationId: "org-b", userId: "user-a" },
      select: { id: true },
    });
    expect(mocks.setActiveOrganization).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("sets a site cookie only after validating both organization membership and site ownership", async () => {
    vi.spyOn(prisma.member, "findFirst").mockResolvedValue({ id: "member-a" } as never);
    vi.spyOn(prisma.site, "findFirst").mockResolvedValue({ id: "site-b" } as never);

    await switchTenantContext({ organizationId: "org-b", siteId: "site-b" });

    expect(mocks.setActiveOrganization).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { organizationId: "org-b" },
    });
    expect(mocks.setCookie).toHaveBeenCalledWith(
      "maintenance_active_site",
      "site-b",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      }),
    );
  });

  it("refuses to switch to an organization without membership", async () => {
    vi.spyOn(prisma.member, "findFirst").mockResolvedValue(null);

    await expect(
      switchActiveOrganization({ organizationId: "org-b" }),
    ).rejects.toThrow("not accessible");

    expect(mocks.setActiveOrganization).not.toHaveBeenCalled();
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });

  it("does not allow site setup against an organization without an owner/admin membership", async () => {
    vi.spyOn(prisma.member, "findFirst").mockResolvedValue(null);

    await expect(
      createInitialSite({
        organizationId: "org-b",
        siteName: "Foreign site",
      }),
    ).rejects.toThrow("Only an organization owner or admin");

    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: { organizationId: "org-b", userId: "user-a" },
      select: { role: true },
    });
    expect(mocks.setActiveOrganization).not.toHaveBeenCalled();
  });
});
