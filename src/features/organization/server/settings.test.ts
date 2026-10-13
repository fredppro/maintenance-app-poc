import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrganizationSettings, updateOrganizationSettings } from "./settings";

const mocks = vi.hoisted(() => ({
  getOrganizationContext: vi.fn(),
  organizationFind: vi.fn(),
  organizationUpdate: vi.fn(),
  settingsFind: vi.fn(),
  settingsUpsert: vi.fn(),
  fileFind: vi.fn(),
  deleteStoredFile: vi.fn(),
  recordAuditEvent: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/features/files/server/files", () => ({ deleteStoredFile: mocks.deleteStoredFile }));
vi.mock("@/lib/tenant-context", () => ({ getOrganizationContext: mocks.getOrganizationContext }));
vi.mock("@/lib/prisma", () => ({
  default: {
    organization: { findUniqueOrThrow: mocks.organizationFind },
    tenantSettings: { findUnique: mocks.settingsFind },
  },
}));

const db = {
  storedFile: { findFirst: mocks.fileFind },
  transaction: mocks.transaction,
};

const saved = {
  contactEmail: "old@acme.pt",
  contactPhone: null,
  timezone: "Europe/Lisbon",
  locale: "en",
  logoFileId: null as string | null,
};

const input = {
  name: "ACME Facilities",
  contactEmail: "office@acme.pt",
  contactPhone: "+351 21 000 0000",
  timezone: "Europe/Madrid",
  locale: "pt-pt",
  logoFileId: null,
};

describe("organization settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationContext.mockResolvedValue({
      organizationId: "org-a",
      userId: "user-1",
      role: "owner",
      db,
    });
    mocks.organizationFind.mockResolvedValue({ name: "ACME" });
    mocks.settingsFind.mockResolvedValue(saved);
    mocks.transaction.mockImplementation(async (fn) =>
      fn({
        organization: { update: mocks.organizationUpdate },
        tenantSettings: { upsert: mocks.settingsUpsert },
      }),
    );
    mocks.fileFind.mockResolvedValue({ id: "file-1" });
  });

  describe("permissions", () => {
    it("requires the manageOrganization permission to read and to save", async () => {
      await getOrganizationSettings();
      await updateOrganizationSettings(input);

      expect(mocks.getOrganizationContext).toHaveBeenNthCalledWith(1, "manageOrganization");
      expect(mocks.getOrganizationContext).toHaveBeenNthCalledWith(2, "manageOrganization");
    });

    it("refuses roles without the permission and writes nothing", async () => {
      mocks.getOrganizationContext.mockRejectedValue(new Error("The active role does not allow manageOrganization"));

      await expect(getOrganizationSettings()).rejects.toThrow("does not allow");
      await expect(updateOrganizationSettings(input)).rejects.toThrow("does not allow");
      expect(mocks.organizationFind).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
  });

  describe("tenant isolation", () => {
    it("reads only the active organization", async () => {
      mocks.settingsFind.mockResolvedValue(null);

      expect(await getOrganizationSettings()).toMatchObject({ name: "ACME", timezone: "Europe/Lisbon", locale: "en" });
      expect(mocks.organizationFind).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "org-a" } }),
      );
      expect(mocks.settingsFind).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-a" } }),
      );
    });

    it("writes only to the active organization, whatever organization the client names", async () => {
      await updateOrganizationSettings({ ...input, organizationId: "org-b", id: "org-b" });

      expect(mocks.organizationUpdate).toHaveBeenCalledWith({ where: { id: "org-a" }, data: { name: "ACME Facilities" } });
      const upsert = mocks.settingsUpsert.mock.calls[0][0];
      expect(upsert.where).toEqual({ organizationId: "org-a" });
      expect(upsert.create.organizationId).toBe("org-a");
      expect(JSON.stringify(mocks.settingsUpsert.mock.calls)).not.toContain("org-b");
      expect(JSON.stringify(mocks.organizationUpdate.mock.calls)).not.toContain("org-b");
    });
  });

  describe("saving", () => {
    it("persists the profile and regional values", async () => {
      expect(await updateOrganizationSettings(input)).toEqual({ ok: true });

      const { create, update } = mocks.settingsUpsert.mock.calls[0][0];
      const values = {
        contactEmail: "office@acme.pt",
        contactPhone: "+351 21 000 0000",
        timezone: "Europe/Madrid",
        locale: "pt-pt",
        logoFileId: null,
      };
      expect(update).toEqual(values);
      expect(create).toEqual({ organizationId: "org-a", ...values });
    });

    it("never writes the slug, lifecycle status, deletion state or membership", async () => {
      await updateOrganizationSettings({
        ...input,
        slug: "hijacked",
        status: "SUSPENDED",
        deletionScheduledFor: new Date(),
        onboardingDismissedAt: new Date(),
        role: "owner",
      });

      expect(Object.keys(mocks.organizationUpdate.mock.calls[0][0].data)).toEqual(["name"]);
      const { create, update } = mocks.settingsUpsert.mock.calls[0][0];
      const allowed = ["contactEmail", "contactPhone", "timezone", "locale", "logoFileId"];
      expect(Object.keys(update).sort()).toEqual([...allowed].sort());
      expect(Object.keys(create).sort()).toEqual(["organizationId", ...allowed].sort());
    });

    it("returns field errors for invalid values without writing anything", async () => {
      const result = await updateOrganizationSettings({
        ...input,
        name: "A",
        contactEmail: "nope",
        timezone: "Mars/Olympus",
        locale: "fr",
      });

      expect(result).toEqual({
        ok: false,
        errors: { name: "tooShort", contactEmail: "invalid", timezone: "invalid", locale: "invalid" },
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    });

    it("rejects input that is not an object", async () => {
      expect((await updateOrganizationSettings(null)).ok).toBe(false);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("clears optional contact details", async () => {
      await updateOrganizationSettings({ ...input, contactEmail: "", contactPhone: "" });

      expect(mocks.settingsUpsert.mock.calls[0][0].update).toMatchObject({ contactEmail: null, contactPhone: null });
    });

    it("does nothing when nothing changed", async () => {
      mocks.organizationFind.mockResolvedValue({ name: "ACME Facilities" });
      mocks.settingsFind.mockResolvedValue({
        contactEmail: "office@acme.pt",
        contactPhone: "+351 21 000 0000",
        timezone: "Europe/Madrid",
        locale: "pt-pt",
        logoFileId: null,
      });

      expect(await updateOrganizationSettings(input)).toEqual({ ok: true });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    });

    it("saves the defaults explicitly the first time, so later default changes do not move the organization", async () => {
      mocks.organizationFind.mockResolvedValue({ name: "ACME Facilities" });
      mocks.settingsFind.mockResolvedValue(null);

      await updateOrganizationSettings({
        name: "ACME Facilities",
        contactEmail: "",
        contactPhone: "",
        timezone: "Europe/Lisbon",
        locale: "en",
        logoFileId: null,
      });

      expect(mocks.settingsUpsert.mock.calls[0][0].create).toMatchObject({ timezone: "Europe/Lisbon", locale: "en" });
    });

    it("audits which fields changed, without their values", async () => {
      await updateOrganizationSettings(input);

      const event = mocks.recordAuditEvent.mock.calls[0][0];
      expect(event).toMatchObject({
        organizationId: "org-a",
        actorUserId: "user-1",
        action: "organization.settings_updated",
      });
      expect(event.details.fields.sort()).toEqual(["contactEmail", "contactPhone", "locale", "name", "timezone"]);
      expect(JSON.stringify(event)).not.toContain("office@acme.pt");
    });
  });

  describe("logo", () => {
    it("accepts only an uploaded file of this organization that equipment does not use", async () => {
      await updateOrganizationSettings({ ...input, logoFileId: "file-1" });

      expect(mocks.fileFind).toHaveBeenCalledWith({
        where: { id: "file-1", organizationId: "org-a", equipment: { none: {} } },
        select: { id: true },
      });
      expect(mocks.settingsUpsert.mock.calls[0][0].update.logoFileId).toBe("file-1");
    });

    it("rejects another organization's file, an equipment photo or a missing file", async () => {
      mocks.fileFind.mockResolvedValue(null);

      expect(await updateOrganizationSettings({ ...input, logoFileId: "file-of-org-b" })).toEqual({
        ok: false,
        errors: { logoFileId: "invalid" },
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it("keeps the current logo without re-validating it", async () => {
      mocks.settingsFind.mockResolvedValue({ ...saved, logoFileId: "file-1" });

      await updateOrganizationSettings({ ...input, logoFileId: "file-1" });

      expect(mocks.fileFind).not.toHaveBeenCalled();
      expect(mocks.deleteStoredFile).not.toHaveBeenCalled();
    });

    it("deletes the replaced or removed logo file after saving", async () => {
      mocks.settingsFind.mockResolvedValue({ ...saved, logoFileId: "old-file" });
      mocks.fileFind.mockResolvedValue({ id: "any" });

      await updateOrganizationSettings({ ...input, logoFileId: null });

      expect(mocks.settingsUpsert.mock.calls[0][0].update.logoFileId).toBeNull();
      expect(mocks.deleteStoredFile).toHaveBeenCalledWith(db, "old-file", "org-a");
    });

    it("does not delete a replaced logo file that equipment still uses", async () => {
      mocks.settingsFind.mockResolvedValue({ ...saved, logoFileId: "shared-file" });
      mocks.fileFind.mockResolvedValue(null);

      expect(await updateOrganizationSettings({ ...input, logoFileId: null })).toEqual({ ok: true });
      expect(mocks.deleteStoredFile).not.toHaveBeenCalled();
    });

    it("still reports success when removing the old file fails", async () => {
      mocks.settingsFind.mockResolvedValue({ ...saved, logoFileId: "old-file" });
      mocks.fileFind.mockResolvedValue({ id: "any" });
      mocks.deleteStoredFile.mockRejectedValue(new Error("storage down"));

      expect(await updateOrganizationSettings({ ...input, logoFileId: null })).toEqual({ ok: true });
    });
  });
});
