import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCreateArgs } from "../../../../scripts/ops/tenant-admin";
import {
  OWNER_INVITATION_DAYS,
  listOrganizations,
  ownerInvitationUrl,
  provisionOrganization,
} from "./provisioning";

const mocks = vi.hoisted(() => ({
  userUpsert: vi.fn(),
  organizationFindFirst: vi.fn(),
  organizationFindMany: vi.fn(),
  organizationCreate: vi.fn(),
  organizationDelete: vi.fn(),
  invitationCreate: vi.fn(),
  invitationFindMany: vi.fn(),
  memberFindMany: vi.fn(),
  auditGroupBy: vi.fn(),
  transaction: vi.fn(),
  siteCreate: vi.fn(),
  equipmentCount: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/features/auth/server/email", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: {
    user: { upsert: mocks.userUpsert },
    organization: {
      findFirst: mocks.organizationFindFirst,
      findMany: mocks.organizationFindMany,
      create: mocks.organizationCreate,
      delete: mocks.organizationDelete,
    },
    invitation: { create: mocks.invitationCreate, findMany: mocks.invitationFindMany },
    member: { findMany: mocks.memberFindMany },
    organizationAuditEvent: { groupBy: mocks.auditGroupBy },
    $transaction: mocks.transaction,
  },
  forTenant: () => ({
    site: { create: mocks.siteCreate },
    equipment: { count: mocks.equipmentCount },
  }),
}));

const input = { name: "  ACME Facilities ", ownerEmail: "Joao@ACME.pt", siteName: "Lisbon" };
const now = new Date("2026-10-08T12:00:00Z");

describe("provisionOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizationFindFirst.mockResolvedValue(null);
    mocks.userUpsert.mockResolvedValue({ id: "operator-user" });
    mocks.transaction.mockResolvedValue([]);
    mocks.siteCreate.mockResolvedValue({ id: "site-1" });
  });

  it("creates the organization, a pending owner invitation and the first site", async () => {
    const result = await provisionOrganization(input, { now });

    const org = mocks.organizationCreate.mock.calls[0][0].data;
    expect(org).toMatchObject({ name: "ACME Facilities", createdAt: now });
    expect(org.slug).toMatch(/^acme-facilities-[0-9a-f]{8}$/);

    const invitation = mocks.invitationCreate.mock.calls[0][0].data;
    expect(invitation).toMatchObject({
      organizationId: org.id,
      email: "joao@acme.pt",
      role: "owner",
      status: "pending",
      inviterId: "operator-user",
    });
    expect(invitation.expiresAt.getTime() - now.getTime()).toBe(OWNER_INVITATION_DAYS * 86_400_000);

    expect(mocks.siteCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Lisbon", organizationId: org.id } }),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "organization.provisioned", organizationId: org.id }),
    );
    // The invitation id is the accept-link token; it must not be copied into the audit trail.
    const audit = JSON.stringify(mocks.recordAuditEvent.mock.calls[0][0]);
    expect(audit).not.toContain(invitation.id);
    expect(audit).not.toContain("joao@acme.pt");
    expect(result).toMatchObject({ organizationId: org.id, siteId: "site-1", invitationId: invitation.id });
  });

  it("refuses a duplicate company name unless explicitly allowed", async () => {
    mocks.organizationFindFirst.mockResolvedValue({ id: "org-existing" });

    await expect(provisionOrganization(input)).rejects.toThrow("already exists (org-existing)");
    expect(mocks.organizationCreate).not.toHaveBeenCalled();

    await provisionOrganization(input, { allowDuplicateName: true });
    expect(mocks.organizationCreate).toHaveBeenCalled();
  });

  it("validates the input before touching the database", async () => {
    await expect(provisionOrganization({ ...input, ownerEmail: "not-an-email" })).rejects.toThrow();
    await expect(provisionOrganization({ ...input, siteName: "x" })).rejects.toThrow();
    expect(mocks.userUpsert).not.toHaveBeenCalled();
  });

  it("removes the organization when the first site cannot be created", async () => {
    mocks.siteCreate.mockRejectedValue(new Error("boom"));

    await expect(provisionOrganization(input)).rejects.toThrow("boom");
    const { id } = mocks.organizationCreate.mock.calls[0][0].data;
    expect(mocks.organizationDelete).toHaveBeenCalledWith({ where: { id } });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("ownerInvitationUrl", () => {
  it("builds the localized accept-invitation link", () => {
    expect(ownerInvitationUrl("inv-1", "https://app.example.com", "pt-pt")).toBe(
      "https://app.example.com/pt-pt/accept-invitation?id=inv-1",
    );
    expect(ownerInvitationUrl("inv-1", "https://app.example.com")).toContain("/en/accept-invitation");
  });

  it("rejects unsupported locales", () => {
    expect(() => ownerInvitationUrl("inv-1", "https://app.example.com", "fr")).toThrow("Unsupported locale");
  });
});

describe("parseCreateArgs", () => {
  it("reads the positional values and options", () => {
    expect(
      parseCreateArgs(["ACME", "a@b.pt", "Lisbon", "--locale", "pt-pt", "--no-email", "--allow-duplicate-name"]),
    ).toEqual({
      name: "ACME",
      ownerEmail: "a@b.pt",
      siteName: "Lisbon",
      locale: "pt-pt",
      sendEmail: false,
      allowDuplicateName: true,
    });
  });

  it("defaults to English with email on, and rejects bad usage", () => {
    expect(parseCreateArgs(["ACME", "a@b.pt", "Lisbon"])).toMatchObject({ locale: "en", sendEmail: true });
    expect(() => parseCreateArgs(["ACME", "a@b.pt"])).toThrow("Usage");
    expect(() => parseCreateArgs(["ACME", "a@b.pt", "Lisbon", "--nope"])).toThrow("Unknown option");
  });
});

describe("listOrganizations", () => {
  it("summarizes owner, size, status and last sign-in per organization", async () => {
    mocks.organizationFindMany.mockResolvedValue([
      {
        id: "org-1",
        name: "ACME",
        createdAt: new Date("2026-09-01T00:00:00Z"),
        settings: null,
        _count: { members: 3, sites: 2 },
      },
      {
        id: "org-2",
        name: "Pending Co",
        createdAt: new Date("2026-10-01T00:00:00Z"),
        settings: { status: "SUSPENDED" },
        _count: { members: 0, sites: 1 },
      },
    ]);
    mocks.memberFindMany.mockResolvedValue([{ organizationId: "org-1", user: { email: "owner@acme.pt" } }]);
    mocks.invitationFindMany.mockResolvedValue([{ organizationId: "org-2", email: "boss@pending.pt" }]);
    mocks.auditGroupBy.mockResolvedValue([
      { organizationId: "org-1", _max: { createdAt: new Date("2026-10-07T09:00:00Z") } },
    ]);
    mocks.equipmentCount.mockResolvedValueOnce(12).mockResolvedValueOnce(0);

    const rows = await listOrganizations(now);
    expect(mocks.equipmentCount).toHaveBeenCalledWith({ where: { organizationId: "org-1" } });
    expect(mocks.equipmentCount).toHaveBeenCalledWith({ where: { organizationId: "org-2" } });
    expect(rows).toEqual([
      {
        id: "org-1",
        name: "ACME",
        status: "ACTIVE",
        owner: "owner@acme.pt",
        members: 3,
        sites: 2,
        equipment: 12,
        lastSignIn: "2026-10-07",
        created: "2026-09-01",
      },
      {
        id: "org-2",
        name: "Pending Co",
        status: "SUSPENDED",
        owner: "invited: boss@pending.pt",
        members: 0,
        sites: 1,
        equipment: 0,
        lastSignIn: "never",
        created: "2026-10-01",
      },
    ]);
  });
});
