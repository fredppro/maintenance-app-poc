import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPublicSignupAllowed,
  mayCreateAccount,
  mayCreateOrganization,
  type SignupPolicyConfig,
} from "./signup-policy";

const mocks = vi.hoisted(() => ({ orgCount: vi.fn(), invitationFind: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    organization: { count: mocks.orgCount },
    invitation: { findFirst: mocks.invitationFind },
  },
}));

const production: SignupPolicyConfig = {
  isProduction: true,
  allowPublicSignup: false,
  bootstrapEmail: "owner@pilot.example",
};

describe("sign-up policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orgCount.mockResolvedValue(3);
    mocks.invitationFind.mockResolvedValue(null);
  });

  describe("mayCreateAccount", () => {
    it("is open outside production and when public sign-up is explicitly enabled", async () => {
      expect(await mayCreateAccount("anyone@example.com", { ...production, isProduction: false })).toBe(true);
      expect(await mayCreateAccount("anyone@example.com", { ...production, allowPublicSignup: true })).toBe(true);
      expect(mocks.invitationFind).not.toHaveBeenCalled();
    });

    it("is closed in production without an invitation", async () => {
      expect(await mayCreateAccount("stranger@example.com", production)).toBe(false);
    });

    it("requires a pending, unexpired invitation for exactly that address", async () => {
      mocks.invitationFind.mockResolvedValue({ id: "inv-1" });

      expect(await mayCreateAccount("  Invitee@Example.COM ", production)).toBe(true);
      expect(mocks.invitationFind).toHaveBeenCalledWith({
        where: { email: "invitee@example.com", status: "pending", expiresAt: { gt: expect.any(Date) } },
        select: { id: true },
      });
    });

    it("lets the bootstrap owner in only while no customer organization exists", async () => {
      mocks.orgCount.mockResolvedValue(0);
      expect(await mayCreateAccount("Owner@Pilot.Example", production)).toBe(true);

      mocks.orgCount.mockResolvedValue(1);
      expect(await mayCreateAccount("owner@pilot.example", production)).toBe(false);
    });

    it("does not treat another address as the bootstrap owner", async () => {
      mocks.orgCount.mockResolvedValue(0);
      expect(await mayCreateAccount("someone-else@example.com", production)).toBe(false);
    });

    it("ignores the bootstrap path when no bootstrap email is configured", async () => {
      mocks.orgCount.mockResolvedValue(0);
      expect(await mayCreateAccount("owner@pilot.example", { ...production, bootstrapEmail: undefined })).toBe(false);
    });
  });

  describe("mayCreateOrganization", () => {
    it("is open outside production and with public sign-up", async () => {
      expect(await mayCreateOrganization("a@example.com", { ...production, isProduction: false })).toBe(true);
      expect(await mayCreateOrganization("a@example.com", { ...production, allowPublicSignup: true })).toBe(true);
    });

    it("lets invited users join organizations but not create their own in production", async () => {
      mocks.invitationFind.mockResolvedValue({ id: "inv-1" });
      mocks.orgCount.mockResolvedValue(5);

      expect(await mayCreateOrganization("invitee@example.com", production)).toBe(false);
    });

    it("allows only the bootstrap owner, and only for the first customer", async () => {
      mocks.orgCount.mockResolvedValue(0);
      expect(await mayCreateOrganization("owner@pilot.example", production)).toBe(true);

      mocks.orgCount.mockResolvedValue(2);
      expect(await mayCreateOrganization("owner@pilot.example", production)).toBe(false);
    });

    it("excludes the legacy workspace when counting customer organizations", async () => {
      mocks.orgCount.mockResolvedValue(0);
      await mayCreateOrganization("owner@pilot.example", production);

      expect(mocks.orgCount.mock.calls[0][0].where.slug.not).toBeTruthy();
    });
  });
});

describe("isPublicSignupAllowed", () => {
  it("honours ALLOW_PUBLIC_SIGNUP=true on previews and in plain production-mode hosting", () => {
    expect(isPublicSignupAllowed({ ALLOW_PUBLIC_SIGNUP: "true", VERCEL_ENV: "preview" } as never)).toBe(true);
    expect(isPublicSignupAllowed({ ALLOW_PUBLIC_SIGNUP: "true" } as never)).toBe(true);
  });

  it("is ignored on the Vercel production environment", () => {
    expect(isPublicSignupAllowed({ ALLOW_PUBLIC_SIGNUP: "true", VERCEL_ENV: "production" } as never)).toBe(false);
  });

  it("needs the exact value true", () => {
    for (const value of [undefined, "", "1", "TRUE", "yes", "false"]) {
      expect(isPublicSignupAllowed({ ALLOW_PUBLIC_SIGNUP: value, VERCEL_ENV: "preview" } as never)).toBe(false);
    }
  });
});
