import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import {
  getEquipment,
  addEquipment,
  updateEquipment,
  relocateEquipment,
  getEquipmentRelocations,
  getSections,
  createSection,
  createSite,
  renameSection,
  deleteSection,
  deleteEquipment,
  restoreEquipment,
  getTasks,
  createTask,
  updateTask,
  previewMaintenanceTaskEmail,
  sendMaintenanceTaskEmail,
  deleteTask,
  moveTask,
  recordOperatingHours,
  consumeInventory,
} from "./actions";
import {
  MaintenanceReminderStatus,
  MaintenanceTaskNotificationType,
  MaterialUnit,
  TaskType,
} from "../../../../prisma/generated/prisma/enums";
import { cookies } from "next/headers";
import {
  getOrganizationContext,
  getTenantContext,
  setActiveSiteCookie,
} from "@/lib/tenant-context";
import { recordAuditEvent } from "@/lib/audit";
import {
  deleteStoredFile,
  markStoredFileAttached,
} from "@/features/files/server/files";

const notificationMocks = vi.hoisted(() => ({
  dispatchById: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("./reminders", () => ({
  dispatchMaintenanceReminderById: notificationMocks.dispatchById,
  dispatchMaintenanceReminders: notificationMocks.dispatch,
}));

// The tenant client is the shared prisma object, so spies on `prisma` observe the actions' queries.
vi.mock("@/lib/tenant-context", async () => {
  const { default: prisma } = await import("@/lib/prisma");
  const db = Object.create(prisma, {
    transaction: { value: (fn: never) => prisma.$transaction(fn) },
  });

  const context = {
    db,
    userId: "user-1",
    organizationId: "org-1",
    siteId: "site-1",
    siteName: "Plant",
    role: "owner",
  };
  return {
    getTenantContext: vi.fn().mockResolvedValue(context),
    getOrganizationContext: vi.fn().mockResolvedValue(context),
    ACTIVE_SITE_COOKIE: "maintenance_active_site",
    setActiveSiteCookie: vi.fn(),
  };
});

vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));

vi.mock("@/features/files/server/files", () => ({
  deleteStoredFile: vi.fn(),
  markStoredFileAttached: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn() }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("scheduler server actions", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(getTenantContext).mockClear();
    notificationMocks.dispatch.mockClear();
    notificationMocks.dispatchById.mockClear();
    notificationMocks.dispatch.mockResolvedValue({
      cancelled: 0,
      failed: 0,
      sent: 0,
      skipped: 0,
    });
    notificationMocks.dispatchById.mockResolvedValue("sent");
    vi.spyOn(prisma.equipment, "findFirst").mockResolvedValue({ id: "eq-1" } as never);
    vi.spyOn(prisma.worker, "count").mockResolvedValue(2);
    vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({ id: "task-123" } as never);
  });

  afterEach(() => {
    vi.mocked(revalidatePath).mockClear();
    vi.restoreAllMocks();
  });

  describe("equipment actions", () => {
    it("rejects invalid equipment input before writing to the database", async () => {
      const createMock = vi.spyOn(prisma.equipment, "create");

      await expect(addEquipment({ name: "  " })).rejects.toThrow();
      expect(createMock).not.toHaveBeenCalled();
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
      createMock.mockRestore();
    });

    it("getEquipment orders by name ascending", async () => {
      const mockEquipments = [{ id: "eq-1", name: "Conveyor" }];
      const findManyMock = vi.spyOn(prisma.equipment, "findMany").mockResolvedValue(mockEquipments as any);

      try {
        const result = await getEquipment();
        expect(getTenantContext).toHaveBeenCalledWith("viewMaintenance");
        expect(result).toEqual(mockEquipments);
        expect(findManyMock).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { organizationId: "org-1", siteId: "site-1" },
            orderBy: { name: "asc" },
          }),
        );
      } finally {
        findManyMock.mockRestore();
      }
    });

    it("addEquipment creates record and revalidates path", async () => {
      const newEquip = { name: "Press B", category: "Heavy" };
      const created = { id: "eq-2", ...newEquip, createdAt: new Date() };

      const createMock = vi.spyOn(prisma.equipment, "create").mockResolvedValue(created as any);

      try {
        const result = await addEquipment(newEquip);
        expect(getTenantContext).toHaveBeenCalledWith("manageMaintenance");
        expect(result).toEqual(created);
        expect(createMock).toHaveBeenCalledWith({
          data: {
            ...newEquip,
            sectionId: null,
            organizationId: "org-1",
            siteId: "site-1",
            relocations: {
              create: {
                toSiteName: "Plant",
                toSectionName: null,
                movedById: "user-1",
              },
            },
          },
        });
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/");
      } finally {
        createMock.mockRestore();
      }
    });

    it("claims a new equipment photo in the same transaction that links it", async () => {
      vi.spyOn(prisma, "$transaction").mockImplementation(
        (callback) => callback(prisma as never),
      );
      vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue({ id: "file-1" } as never);
      vi.spyOn(prisma.equipment, "create").mockResolvedValue({ id: "eq-2" } as never);

      await addEquipment({ name: "Press", imageFileId: "file-1" });

      expect(markStoredFileAttached).toHaveBeenCalledWith(prisma, "file-1", "org-1");
    });

    it("updateEquipment updates record and revalidates path", async () => {
      const updateData = { name: "Press B (Modified)" };
      const updated = { id: "eq-2", name: "Press B (Modified)", category: "Heavy", createdAt: new Date() };

      const updateMock = vi.spyOn(prisma.equipment, "update").mockResolvedValue(updated as any);

      try {
        const result = await updateEquipment("eq-2", updateData);
        expect(result).toEqual(updated);
        expect(updateMock).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "eq-2", organizationId: "org-1", siteId: "site-1" },
            data: updateData,
          }),
        );
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        updateMock.mockRestore();
      }
    });

    describe("relocateEquipment", () => {
      const current = {
        id: "eq-1",
        siteId: "site-1",
        sectionId: null,
        site: { name: "Plant" },
        section: null,
      };

      it("moves equipment to another site and section and records history", async () => {
        vi.spyOn(prisma.equipment, "findFirst").mockResolvedValue(current as never);
        vi.spyOn(prisma.site, "findFirst").mockResolvedValue({ id: "site-2", name: "Depot" } as never);
        vi.spyOn(prisma.section, "findFirst").mockResolvedValue({ id: "sec-1", name: "Dock" } as never);
        const update = vi.spyOn(prisma.equipment, "update").mockResolvedValue({ id: "eq-1" } as never);

        await relocateEquipment("eq-1", { siteId: "site-2", sectionId: "sec-1" });

        expect(prisma.section.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "sec-1", organizationId: "org-1", siteId: "site-2" },
          }),
        );
        expect(update).toHaveBeenCalledWith({
          where: { id: "eq-1" },
          data: {
            siteId: "site-2",
            sectionId: "sec-1",
            relocations: {
              create: {
                fromSiteName: "Plant",
                fromSectionName: null,
                toSiteName: "Depot",
                toSectionName: "Dock",
                movedById: "user-1",
              },
            },
          },
        });
      });

      it("rejects a section that does not belong to the target site", async () => {
        vi.spyOn(prisma.equipment, "findFirst").mockResolvedValue(current as never);
        vi.spyOn(prisma.site, "findFirst").mockResolvedValue({ id: "site-2", name: "Depot" } as never);
        vi.spyOn(prisma.section, "findFirst").mockResolvedValue(null);
        const update = vi.spyOn(prisma.equipment, "update");

        await expect(
          relocateEquipment("eq-1", { siteId: "site-2", sectionId: "other" }),
        ).rejects.toThrow("Section not found");
        expect(update).not.toHaveBeenCalled();
      });

      it("does nothing when the location is unchanged", async () => {
        vi.spyOn(prisma.equipment, "findFirst").mockResolvedValue(current as never);
        vi.spyOn(prisma.site, "findFirst").mockResolvedValue({ id: "site-1", name: "Plant" } as never);
        const update = vi.spyOn(prisma.equipment, "update");

        await relocateEquipment("eq-1", { siteId: "site-1", sectionId: null });
        expect(update).not.toHaveBeenCalled();
      });
    });

    it("deleteEquipment moves the equipment and its tasks to the trash", async () => {
      vi.spyOn(prisma, "$transaction").mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
      const equipmentUpdate = vi.spyOn(prisma.equipment, "updateMany").mockResolvedValue({ count: 1 });
      const taskUpdate = vi.spyOn(prisma.maintenanceTask, "updateMany").mockResolvedValue({ count: 2 });

      await deleteEquipment("eq-2");

      expect(getTenantContext).toHaveBeenCalledWith("deleteMaintenance");
      expect(equipmentUpdate).toHaveBeenCalledWith({
        where: { id: "eq-2", organizationId: "org-1", siteId: "site-1", deletedAt: null },
        data: { deletedAt: expect.any(Date), deletedById: "user-1" },
      });
      expect(taskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { equipmentId: "eq-2", organizationId: "org-1", deletedAt: null },
        }),
      );
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "equipment.deleted", subjectId: "eq-2" }),
      );
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
    });

    it("restoreEquipment restores the tasks trashed with it", async () => {
      const deletedAt = new Date("2026-01-01T00:00:00Z");
      vi.spyOn(prisma, "$transaction").mockImplementation(((fn: (tx: unknown) => unknown) => fn(prisma)) as never);
      vi.spyOn(prisma.equipment, "findFirst").mockResolvedValue({ deletedAt } as never);
      vi.spyOn(prisma.equipment, "updateMany").mockResolvedValue({ count: 1 });
      const taskUpdate = vi.spyOn(prisma.maintenanceTask, "updateMany").mockResolvedValue({ count: 1 });

      await restoreEquipment("eq-2");

      expect(taskUpdate).toHaveBeenCalledWith({
        where: { equipmentId: "eq-2", organizationId: "org-1", deletedAt },
        data: { deletedAt: null, deletedById: null },
      });
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: "equipment.restored" }),
      );
    });
  });

  describe("equipment files and sections", () => {
    beforeEach(() => vi.mocked(deleteStoredFile).mockClear());

    it("rejects an image that belongs to another organization", async () => {
      vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue(null);
      const create = vi.spyOn(prisma.equipment, "create");
      await expect(addEquipment({ name: "Press", imageFileId: "foreign" })).rejects.toThrow("File not found");
      expect(create).not.toHaveBeenCalled();
    });

    it("rejects a section from another site when adding equipment", async () => {
      vi.spyOn(prisma.section, "findFirst").mockResolvedValue(null);
      const create = vi.spyOn(prisma.equipment, "create");
      await expect(addEquipment({ name: "Press", sectionId: "elsewhere" })).rejects.toThrow("Section not found");
      expect(create).not.toHaveBeenCalled();
    });

    it("records the initial placement in the location history", async () => {
      vi.spyOn(prisma.section, "findFirst").mockResolvedValue({ id: "sec-1", name: "Dock" } as never);
      const create = vi.spyOn(prisma.equipment, "create").mockResolvedValue({ id: "eq-9" } as never);
      await addEquipment({ name: "Press", sectionId: "sec-1" });
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sectionId: "sec-1",
          siteId: "site-1",
          relocations: {
            create: expect.objectContaining({ toSiteName: "Plant", toSectionName: "Dock", movedById: "user-1" }),
          },
        }),
      });
    });

    it("deletes the previous image when it is replaced", async () => {
      vi.spyOn(prisma, "$transaction").mockImplementation(
        (callback) => callback(prisma as never),
      );
      vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue({ id: "new" } as never);
      vi.spyOn(prisma.equipment, "findFirst").mockResolvedValue({ imageFileId: "old" } as never);
      vi.spyOn(prisma.equipment, "update").mockResolvedValue({ id: "eq-1" } as never);
      await updateEquipment("eq-1", { imageFileId: "new" });
      expect(deleteStoredFile).toHaveBeenCalledWith(expect.anything(), "old", "org-1");
    });

    it("keeps the image when other fields change or the same image is resubmitted", async () => {
      vi.spyOn(prisma.equipment, "findFirst").mockResolvedValue({ imageFileId: "old" } as never);
      vi.spyOn(prisma.equipment, "update").mockResolvedValue({ id: "eq-1" } as never);
      await updateEquipment("eq-1", { name: "Renamed" });
      vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue({ id: "old" } as never);
      await updateEquipment("eq-1", { imageFileId: "old" });
      expect(deleteStoredFile).not.toHaveBeenCalled();
    });

    it("refuses to update equipment outside the active site", async () => {
      vi.spyOn(prisma.equipment, "findFirst").mockResolvedValue(null);
      const update = vi.spyOn(prisma.equipment, "update");
      await expect(updateEquipment("eq-x", { name: "Hi" })).rejects.toThrow("Equipment not found");
      expect(update).not.toHaveBeenCalled();
    });

    it("scopes relocation history to the active site and organization", async () => {
      const find = vi.spyOn(prisma.equipmentRelocation, "findMany").mockResolvedValue([]);
      await getEquipmentRelocations("eq-1");
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { equipmentId: "eq-1", organizationId: "org-1", equipment: { siteId: "site-1" } },
          orderBy: { movedAt: "desc" },
        }),
      );
    });

    it("lists sections across the organization alphabetically", async () => {
      const find = vi.spyOn(prisma.section, "findMany").mockResolvedValue([]);
      await getSections();
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-1" }, orderBy: { name: "asc" } }),
      );
    });

    it("creates a section only in a site of the active organization", async () => {
      vi.spyOn(prisma.site, "findFirst").mockResolvedValue(null);
      const upsert = vi.spyOn(prisma.section, "upsert");
      await expect(createSection("foreign-site", "Dock")).rejects.toThrow("Site not found");
      expect(upsert).not.toHaveBeenCalled();
    });

    it("creates sections idempotently by trimmed name", async () => {
      vi.spyOn(prisma.site, "findFirst").mockResolvedValue({ id: "site-1" } as never);
      const upsert = vi.spyOn(prisma.section, "upsert").mockResolvedValue({ id: "s", name: "Dock", siteId: "site-1" } as never);
      await createSection("site-1", "  Dock ");
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { siteId_name: { siteId: "site-1", name: "Dock" } }, update: {} }),
      );
    });

    it("rejects blank section names and requires site management to rename or delete", async () => {
      await expect(createSection("site-1", "   ")).rejects.toThrow();
      vi.spyOn(prisma.section, "update").mockResolvedValue({ id: "s" } as never);
      vi.spyOn(prisma.section, "delete").mockResolvedValue({} as never);
      await renameSection("s", "New");
      await deleteSection("s");
      expect(getTenantContext).toHaveBeenCalledWith("manageSites");
      expect(prisma.section.delete).toHaveBeenCalledWith({ where: { id: "s", organizationId: "org-1" } });
    });
  });

  describe("createSite", () => {
    beforeEach(() => {
      vi.spyOn(prisma.site, "findMany").mockResolvedValue([{ id: "site-1" }, { id: "site-2" }] as never);
    });

    it("creates a trimmed site in the caller's organization and audits it", async () => {
      const create = vi
        .spyOn(prisma.site, "create")
        .mockResolvedValue({ id: "site-9", name: "Warehouse" } as never);
      await expect(createSite("  Warehouse  ")).resolves.toEqual({
        id: "site-9",
        name: "Warehouse",
      });
      expect(getOrganizationContext).toHaveBeenCalledWith("manageSites");
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: "Warehouse", organizationId: "org-1" },
        }),
      );
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          action: "site.created",
          subjectId: "site-9",
        }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/");
    });

    it("pins the only existing site so adding a second does not force re-selection", async () => {
      vi.mocked(setActiveSiteCookie).mockClear();
      vi.spyOn(prisma.site, "findMany").mockResolvedValue([{ id: "site-1" }] as never);
      vi.spyOn(prisma.site, "create").mockResolvedValue({ id: "site-2", name: "B" } as never);
      await createSite("B");
      expect(setActiveSiteCookie).toHaveBeenCalledWith("site-1");
    });

    it("selects the first site of an empty organization", async () => {
      vi.mocked(setActiveSiteCookie).mockClear();
      vi.spyOn(prisma.site, "findMany").mockResolvedValue([]);
      vi.spyOn(prisma.site, "create").mockResolvedValue({ id: "site-1", name: "A" } as never);
      await createSite("A");
      expect(setActiveSiteCookie).toHaveBeenCalledWith("site-1");
    });

    it("keeps an existing selection and never pins when several sites exist", async () => {
      vi.mocked(setActiveSiteCookie).mockClear();
      vi.spyOn(prisma.site, "create").mockResolvedValue({ id: "site-3", name: "C" } as never);
      vi.spyOn(prisma.site, "findMany").mockResolvedValue([{ id: "a" }, { id: "b" }] as never);
      await createSite("C");
      vi.mocked(cookies).mockResolvedValueOnce({ get: () => ({ value: "a" }) } as never);
      vi.spyOn(prisma.site, "findMany").mockResolvedValue([{ id: "a" }] as never);
      await createSite("D");
      expect(setActiveSiteCookie).not.toHaveBeenCalled();
    });

    it.each(["", "   ", "x".repeat(81)])("rejects invalid name %j", async (name) => {
      const create = vi.spyOn(prisma.site, "create");
      create.mockClear();
      await expect(createSite(name)).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
    });

    it("rejects non-string input", async () => {
      await expect(createSite(undefined as never)).rejects.toThrow();
    });

    it("turns a unique-name violation (including races) into a clear error", async () => {
      vi.mocked(recordAuditEvent).mockClear();
      vi.spyOn(prisma.site, "create").mockRejectedValue({ code: "P2002" });
      await expect(createSite("Plant")).rejects.toThrow("already exists");
      expect(recordAuditEvent).not.toHaveBeenCalled();
    });

    it("rethrows unexpected database errors without auditing", async () => {
      vi.mocked(recordAuditEvent).mockClear();
      vi.spyOn(prisma.site, "create").mockRejectedValue(new Error("db down"));
      await expect(createSite("Plant")).rejects.toThrow("db down");
      expect(recordAuditEvent).not.toHaveBeenCalled();
    });

    it("does nothing when the caller lacks permission or the tenant is inactive", async () => {
      const create = vi.spyOn(prisma.site, "create");
      create.mockClear();
      vi.mocked(getOrganizationContext).mockRejectedValueOnce(
        new Error("Permission denied"),
      );
      await expect(createSite("Plant")).rejects.toThrow("Permission denied");
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe("task actions", () => {
    it("previews only current task assignments and identifies unusable addresses", async () => {
      const startTime = new Date("2026-06-01T08:00:00.000Z");
      const taskFind = vi
        .spyOn(prisma.maintenanceTask, "findFirst")
        .mockResolvedValue({
          id: "task-1",
          title: "Inspect pump",
          startTime,
          assignments: [
            {
              workerId: "worker-1",
              worker: { name: "Ana", email: "ana@example.test" },
            },
            {
              workerId: "worker-2",
              worker: { name: "No email", email: "" },
            },
          ],
        } as never);

      const preview = await previewMaintenanceTaskEmail("task-1");

      expect(taskFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "task-1",
            organizationId: "org-1",
            equipment: { is: { siteId: "site-1" } },
          }),
        }),
      );
      expect(preview).toEqual({
        taskId: "task-1",
        title: "Inspect pump",
        startTime,
        recipients: [
          {
            workerId: "worker-1",
            name: "Ana",
            email: "ana@example.test",
          },
        ],
        excludedRecipients: [{ workerId: "worker-2", name: "No email" }],
      });
    });

    it("sends a confirmed manual email only to workers still assigned to the task", async () => {
      const requestId = "d3f4b24c-9a7e-41b8-8fbd-07d75c55e580";
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-1",
        assignments: [
          {
            workerId: "worker-1",
            worker: { email: "ana@example.test" },
          },
        ],
      } as never);
      vi.spyOn(prisma.tenantSettings, "findUnique").mockResolvedValue({
        locale: "en",
      } as never);
      const upsert = vi
        .spyOn(prisma.maintenanceTaskReminder, "upsert")
        .mockResolvedValue({
          id: "manual-notification-1",
          status: MaintenanceReminderStatus.PENDING,
        } as never);

      const result = await sendMaintenanceTaskEmail({
        taskId: "task-1",
        workerIds: ["worker-1"],
        requestId,
      });

      expect(getTenantContext).toHaveBeenCalledWith("manageMaintenance");
      expect(prisma.maintenanceTask.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "task-1",
            organizationId: "org-1",
            equipment: { is: { siteId: "site-1" } },
          }),
        }),
      );
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            idempotencyKey: `manual:${requestId}:task-1:worker-1`,
          },
          create: expect.objectContaining({
            notificationType: MaintenanceTaskNotificationType.MANUAL,
            requestedById: "user-1",
            recipientEmail: "ana@example.test",
          }),
        }),
      );
      expect(notificationMocks.dispatchById).toHaveBeenCalledWith(
        "org-1",
        "manual-notification-1",
        expect.any(Date),
      );
      expect(result).toEqual({ sent: 1, failed: 0, pending: 0 });
    });

    it("rejects manual recipients that are no longer assigned", async () => {
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-1",
        assignments: [],
      } as never);
      const upsert = vi.spyOn(prisma.maintenanceTaskReminder, "upsert");

      await expect(
        sendMaintenanceTaskEmail({
          taskId: "task-1",
          workerIds: ["worker-1"],
          requestId: "d3f4b24c-9a7e-41b8-8fbd-07d75c55e580",
        }),
      ).rejects.toThrow("One or more selected workers are no longer assigned");

      expect(upsert).not.toHaveBeenCalled();
      expect(notificationMocks.dispatchById).not.toHaveBeenCalled();
    });

    it("requires write permission before attempting a task mutation", async () => {
      vi.mocked(getTenantContext).mockRejectedValueOnce(
        new Error("Permission denied"),
      );
      const createMock = vi.spyOn(prisma.maintenanceTask, "create");

      await expect(
        createTask({
          title: "Unauthorized task",
          startTime: new Date("2026-06-01T08:00:00.000Z"),
          endTime: new Date("2026-06-01T09:00:00.000Z"),
          equipmentId: "eq-1",
          workerIds: [],
        }),
      ).rejects.toThrow("Permission denied");

      expect(getTenantContext).toHaveBeenCalledWith("manageMaintenance");
      expect(createMock).not.toHaveBeenCalled();
      createMock.mockRestore();
    });

    it("rejects invalid task ranges and material values before writing", async () => {
      const createMock = vi.spyOn(prisma.maintenanceTask, "create");
      const startTime = new Date("2026-06-01T10:00:00.000Z");

      await expect(
        createTask({
          title: "Invalid interval",
          startTime,
          endTime: new Date("2026-06-01T09:00:00.000Z"),
          equipmentId: "eq-1",
          workerIds: [],
        }),
      ).rejects.toThrow();

      await expect(
        createTask({
          title: "Invalid material",
          startTime,
          endTime: new Date("2026-06-01T11:00:00.000Z"),
          equipmentId: "eq-1",
          workerIds: [],
          materials: [{ name: "Oil", quantity: 1, price: -1 }],
        }),
      ).rejects.toThrow();

      expect(createMock).not.toHaveBeenCalled();
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
      createMock.mockRestore();
    });

    it("rejects equipment outside the active organization site", async () => {
      const equipmentLookup = vi
        .spyOn(prisma.equipment, "findFirst")
        .mockResolvedValue(null);
      const createMock = vi.spyOn(prisma.maintenanceTask, "create");

      try {
        await expect(
          createTask({
            title: "Cross-tenant task",
            startTime: new Date("2026-06-01T08:00:00.000Z"),
            endTime: new Date("2026-06-01T09:00:00.000Z"),
            equipmentId: "foreign-equipment",
            workerIds: [],
          }),
        ).rejects.toThrow("Equipment not found in the active organization site");
        expect(equipmentLookup).toHaveBeenCalledWith({
          where: {
            id: "foreign-equipment",
            organizationId: "org-1",
            siteId: "site-1",
          },
          select: { id: true },
        });
        expect(createMock).not.toHaveBeenCalled();
      } finally {
        equipmentLookup.mockRestore();
        createMock.mockRestore();
      }
    });

    it("rejects workers outside the active organization", async () => {
      vi.mocked(prisma.worker.count).mockResolvedValue(0);
      const workerLookup = vi.spyOn(prisma.worker, "count");
      const createMock = vi.spyOn(prisma.maintenanceTask, "create");

      try {
        await expect(
          createTask({
            title: "Cross-tenant assignment",
            startTime: new Date("2026-06-01T08:00:00.000Z"),
            endTime: new Date("2026-06-01T09:00:00.000Z"),
            equipmentId: "eq-1",
            workerIds: ["foreign-worker"],
          }),
        ).rejects.toThrow("One or more workers are not in the active organization");
        expect(workerLookup).toHaveBeenCalledWith({
          where: {
            id: { in: ["foreign-worker"] },
            organizationId: "org-1",
          },
        });
        expect(createMock).not.toHaveBeenCalled();
      } finally {
        workerLookup.mockRestore();
        createMock.mockRestore();
      }
    });

    it("does not update a task outside the active organization and site", async () => {
      const taskLookup = vi
        .spyOn(prisma.maintenanceTask, "findFirst")
        .mockResolvedValueOnce(null);
      const updateMock = vi.spyOn(prisma.maintenanceTask, "update");
      const transactionMock = vi.spyOn(prisma, "$transaction");

      try {
        await expect(
          updateTask("foreign-task", { title: "Attempted cross-tenant update" }),
        ).rejects.toThrow(
          "Maintenance task not found in the active organization",
        );
        expect(taskLookup).toHaveBeenCalledWith({
          where: {
            id: "foreign-task",
            organizationId: "org-1",
            equipment: { is: { siteId: "site-1" } },
          },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            equipmentId: true,
            maintenancePointId: true,
            assignments: { select: { workerId: true } },
            status: true,
            completedAt: true,
          },
        });
        expect(updateMock).not.toHaveBeenCalled();
        expect(transactionMock).not.toHaveBeenCalled();
      } finally {
        taskLookup.mockRestore();
        updateMock.mockRestore();
        transactionMock.mockRestore();
      }
    });

    it("rejects partial updates that make the persisted task interval invalid", async () => {
      const startTime = new Date("2026-06-01T10:00:00.000Z");
      const endTime = new Date("2026-06-01T12:00:00.000Z");
      const taskLookup = vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime,
        endTime,
        equipmentId: "eq-1",
        maintenancePointId: null,
        status: "scheduled",
        completedAt: null,
        assignments: [],
      } as never);
      const transaction = vi.spyOn(prisma, "$transaction");
      const update = vi.spyOn(prisma.maintenanceTask, "update");

      try {
        await expect(
          updateTask("task-123", { endTime: new Date("2026-06-01T09:00:00.000Z") }),
        ).rejects.toThrow("Task end time must be after start time");
        await expect(
          updateTask("task-123", { startTime: new Date("2026-06-01T13:00:00.000Z") }),
        ).rejects.toThrow("Task end time must be after start time");
        expect(transaction).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
      } finally {
        taskLookup.mockRestore();
        transaction.mockRestore();
        update.mockRestore();
      }
    });

    it("uses the previously read interval as a compare-and-swap for valid schedule edits", async () => {
      const startTime = new Date("2026-06-01T10:00:00.000Z");
      const endTime = new Date("2026-06-01T12:00:00.000Z");
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime,
        endTime,
        equipmentId: "eq-1",
        maintenancePointId: null,
        status: "scheduled",
        completedAt: null,
        assignments: [],
      } as never);
      const update = vi.fn().mockResolvedValue({ id: "task-123" });
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) =>
          callback({ maintenanceTask: { update } }),
        );

      try {
        await updateTask("task-123", {
          startTime: new Date("2026-06-01T11:00:00.000Z"),
        });

        expect(update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: "task-123",
              organizationId: "org-1",
              startTime,
              endTime,
            },
            data: { startTime: new Date("2026-06-01T11:00:00.000Z") },
          }),
        );
      } finally {
        transaction.mockRestore();
      }
    });

    it("rejects a stale concurrent partial update and leaves the persisted interval valid", async () => {
      const originalStart = new Date("2026-06-01T10:00:00.000Z");
      const originalEnd = new Date("2026-06-01T14:00:00.000Z");
      const nextStart = new Date("2026-06-01T13:00:00.000Z");
      const nextEnd = new Date("2026-06-01T12:00:00.000Z");
      let persisted = { startTime: originalStart, endTime: originalEnd };
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        ...persisted,
        equipmentId: "eq-1",
        maintenancePointId: null,
        status: "scheduled",
        completedAt: null,
        assignments: [],
      } as never);
      const update = vi.fn(async ({ where, data }: any) => {
        if (
          where.startTime.getTime() !== persisted.startTime.getTime() ||
          where.endTime.getTime() !== persisted.endTime.getTime()
        ) {
          throw Object.assign(new Error("stale interval"), { code: "P2025" });
        }
        const effectiveStart = data.startTime ?? persisted.startTime;
        const effectiveEnd =
          data.endTime === undefined ? persisted.endTime : data.endTime;
        if (effectiveEnd !== null && effectiveEnd <= effectiveStart) {
          throw new Error("database interval constraint");
        }
        persisted = { startTime: effectiveStart, endTime: effectiveEnd };
        return { id: "task-123" };
      });
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) =>
          callback({ maintenanceTask: { update } }),
        );

      try {
        const results = await Promise.allSettled([
          updateTask("task-123", { startTime: nextStart }),
          updateTask("task-123", { endTime: nextEnd }),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        const rejected = results.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        expect(rejected?.reason).toBeInstanceOf(Error);
        if (!(rejected?.reason instanceof Error)) {
          throw new Error("Expected the stale schedule update to be rejected");
        }
        expect(rejected.reason.message).toContain(
          "Task schedule changed concurrently. Reload the task and try again.",
        );
        expect(
          persisted.startTime.getTime() === nextStart.getTime() ||
            persisted.endTime.getTime() === nextEnd.getTime(),
        ).toBe(true);
        expect(persisted.endTime === null || persisted.endTime > persisted.startTime).toBe(true);
      } finally {
        transaction.mockRestore();
      }
    });

    it("getTasks queries tasks with equipment, worker assignments, and materials ordered by startTime", async () => {
      const mockTasks = [{ id: "task-1", title: "Maintenance 1" }];
      const findManyMock = vi.spyOn(prisma.maintenanceTask, "findMany").mockResolvedValue(mockTasks as any);

      try {
        const result = await getTasks();
        expect(result).toEqual(mockTasks);
        expect(findManyMock).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId: "org-1",
              equipment: { is: { siteId: "site-1" } },
            },
            relationLoadStrategy: "join",
            include: {
              equipment: true,
              dailyHours: true,
              materials: true,
              checklistItems: { orderBy: { sortOrder: "asc" } },
              assignments: { include: { worker: true } },
              reminders: {
                select: {
                  id: true,
                  workerId: true,
                  notificationType: true,
                  status: true,
                  scheduledFor: true,
                  sentAt: true,
                  attempts: true,
                  worker: { select: { name: true } },
                },
                orderBy: { scheduledFor: "asc" },
              },
            },
            orderBy: { startTime: "asc" },
          }),
        );
      } finally {
        findManyMock.mockRestore();
      }
    });

    it("createTask creates assignments and materials relations with formatted prices", async () => {
      const taskInput = {
        title: "Oil Change",
        description: "Replace engine oil",
        type: TaskType.PREVENTIVE,
        startTime: new Date("2026-06-01T08:00:00.000Z"),
        endTime: new Date("2026-06-01T10:00:00.000Z"),
        equipmentId: "eq-1",
        workerIds: ["worker-1", "worker-2"],
        materials: [
          {
            name: "Synthetic Oil 5W30",
            reference: "OIL-5W30",
            quantity: 5,
            unit: MaterialUnit.L,
            price: 12.5,
          },
        ],
      };

      const createMock = vi
        .spyOn(prisma.maintenanceTask, "create")
        .mockResolvedValue({ id: "task-new", ...taskInput } as any);

      try {
        const result = await createTask(taskInput);
        expect(result.id).toBe("task-new");
        expect(createMock).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              title: "Oil Change",
              equipmentId: "eq-1",
              organizationId: "org-1",
              assignments: {
                create: [
                  { workerId: "worker-1" },
                  { workerId: "worker-2" },
                ],
              },
              materials: {
                create: [
                  {
                    name: "Synthetic Oil 5W30",
                    reference: "OIL-5W30",
                    quantity: 5,
                    unit: MaterialUnit.L,
                    price: "12.50",
                  },
                ],
              },
            }),
          }),
        );
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        createMock.mockRestore();
      }
    });

    it("stores a work-log start instant using the organization time zone", async () => {
      vi.spyOn(prisma.worker, "count").mockResolvedValue(1);
      vi.spyOn(prisma.tenantSettings, "findUnique").mockResolvedValue({
        timezone: "Europe/Lisbon",
      } as never);
      const createTaskRecord = vi
        .spyOn(prisma.maintenanceTask, "create")
        .mockResolvedValue({ id: "task-new" } as never);

      try {
        await createTask({
          title: "Inspect drive",
          startTime: new Date("2026-07-01T08:00:00.000Z"),
          equipmentId: "eq-1",
          workerIds: ["worker-1"],
          dailyHours: [
            {
              workerId: "worker-1",
              workDate: "2026-07-01",
              startTime: "08:30",
              hours: 2,
            },
          ],
        });

        expect(createTaskRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              dailyHours: {
                createMany: {
                  data: [
                    {
                      workerId: "worker-1",
                      workDate: new Date("2026-07-01T00:00:00.000Z"),
                      startTime: new Date("2026-07-01T07:30:00.000Z"),
                      hours: "2.00",
                    },
                  ],
                },
              },
            }),
          }),
        );
      } finally {
        createTaskRecord.mockRestore();
      }
    });

    it("infers duration-only work-log starts from the scheduled time per worker", async () => {
      vi.spyOn(prisma.tenantSettings, "findUnique").mockResolvedValue({
        timezone: "Europe/Lisbon",
      } as never);
      const createTaskRecord = vi
        .spyOn(prisma.maintenanceTask, "create")
        .mockResolvedValue({ id: "task-new" } as never);

      try {
        await createTask({
          title: "Inspect drive",
          startTime: new Date("2026-07-01T07:00:00.000Z"),
          equipmentId: "eq-1",
          workerIds: ["worker-a", "worker-b"],
          dailyHours: [
            { workerId: "worker-a", workDate: "2026-07-01", hours: 3 },
            { workerId: "worker-b", workDate: "2026-07-01", hours: 2 },
            { workerId: "worker-a", workDate: "2026-07-01", hours: 2 },
            { workerId: "worker-b", workDate: "2026-07-01", hours: 1 },
            {
              workerId: "worker-a",
              workDate: "2026-07-01",
              startTime: "14:30",
              hours: 1,
            },
          ],
        });

        expect(createTaskRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              dailyHours: {
                createMany: {
                  data: [
                    {
                      workerId: "worker-a",
                      workDate: new Date("2026-07-01T00:00:00.000Z"),
                      startTime: new Date("2026-07-01T07:00:00.000Z"),
                      hours: "3.00",
                    },
                    {
                      workerId: "worker-b",
                      workDate: new Date("2026-07-01T00:00:00.000Z"),
                      startTime: new Date("2026-07-01T07:00:00.000Z"),
                      hours: "2.00",
                    },
                    {
                      workerId: "worker-a",
                      workDate: new Date("2026-07-01T00:00:00.000Z"),
                      startTime: new Date("2026-07-01T10:00:00.000Z"),
                      hours: "2.00",
                    },
                    {
                      workerId: "worker-b",
                      workDate: new Date("2026-07-01T00:00:00.000Z"),
                      startTime: new Date("2026-07-01T09:00:00.000Z"),
                      hours: "1.00",
                    },
                    {
                      workerId: "worker-a",
                      workDate: new Date("2026-07-01T00:00:00.000Z"),
                      startTime: new Date("2026-07-01T13:30:00.000Z"),
                      hours: "1.00",
                    },
                  ],
                },
              },
            }),
          }),
        );
      } finally {
        createTaskRecord.mockRestore();
      }
    });

    it("creates a task checklist snapshot from the selected maintenance point", async () => {
      vi.spyOn(prisma.equipmentMaintenancePoint, "findFirst").mockResolvedValue({
        id: "point-1",
        equipmentId: "eq-1",
        organizationId: "org-1",
        checklistItems: [
          { id: "template-1", title: "Inspect belt", sortOrder: 0 },
          { id: "template-2", title: "Check lubrication", sortOrder: 1 },
        ],
      } as never);
      const createTaskRecord = vi
        .spyOn(prisma.maintenanceTask, "create")
        .mockResolvedValue({ id: "task-new" } as never);

      try {
        await createTask({
          title: "Inspect drive",
          startTime: new Date("2026-06-01T08:00:00.000Z"),
          equipmentId: "eq-1",
          maintenancePointId: "point-1",
          workerIds: [],
        });

        expect(createTaskRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              maintenancePointId: "point-1",
              endTime: null,
              checklistItems: {
                createMany: {
                  data: [
                    {
                      sourceItemId: "template-1",
                      title: "Inspect belt",
                      sortOrder: 0,
                    },
                    {
                      sourceItemId: "template-2",
                      title: "Check lubrication",
                      sortOrder: 1,
                    },
                  ],
                },
              },
            }),
          }),
        );
      } finally {
        createTaskRecord.mockRestore();
      }
    });

    it("records checklist completion on the tenant-scoped task item", async () => {
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime: new Date("2026-06-30T08:00:00.000Z"),
        equipmentId: "eq-1",
        maintenancePointId: null,
        assignments: [],
      } as never);
      const updateChecklistItem = vi.fn().mockResolvedValue({ count: 1 });
      const fakeTx = {
        maintenanceTaskChecklistItem: { updateMany: updateChecklistItem },
        maintenanceTask: {
          update: vi.fn().mockResolvedValue({ id: "task-123" }),
        },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await updateTask("task-123", {
          checklistItems: [{ id: "check-1", isComplete: true }],
        });
        expect(updateChecklistItem).toHaveBeenCalledWith({
          where: {
            id: "check-1",
            taskId: "task-123",
            organizationId: "org-1",
          },
          data: {
            isComplete: true,
            completedAt: expect.any(Date),
            completedById: "user-1",
          },
        });
      } finally {
        transaction.mockRestore();
      }
    });

    it("records operating-hour readings without allowing backdated or decreasing values", async () => {
      const previousMeasuredAt = new Date("2026-06-30T08:00:00.000Z");
      const measuredAt = new Date("2026-07-01T08:00:00.000Z");
      const createReading = vi.fn().mockResolvedValue({ id: "reading-2" });
      const fakeTx = {
        equipmentOperatingHourReading: {
          findFirst: vi.fn().mockResolvedValue({
            measuredAt: previousMeasuredAt,
            reading: "100.00",
          }),
          create: createReading,
        },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await expect(
          recordOperatingHours("eq-1", { reading: 99, measuredAt }),
        ).rejects.toThrow("Operating-hour readings must be chronological");
        await expect(
          recordOperatingHours("eq-1", { reading: 101, measuredAt }),
        ).resolves.toEqual({ id: "reading-2" });
        expect(createReading).toHaveBeenCalledWith({
          data: {
            equipmentId: "eq-1",
            organizationId: "org-1",
            reading: "101.00",
            measuredAt,
            note: null,
            recordedById: "user-1",
          },
        });
      } finally {
        transaction.mockRestore();
      }
    });

    it("decrements stock and writes actual task consumption atomically", async () => {
      const decrementStock = vi.fn().mockResolvedValue({ count: 1 });
      const createMovement = vi.fn().mockResolvedValue({ id: "movement-1" });
      const fakeTx = {
        maintenanceTask: {
          findFirst: vi.fn().mockResolvedValue({ id: "task-123" }),
        },
        inventoryItem: { updateMany: decrementStock },
        inventoryMovement: { create: createMovement },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await expect(
          consumeInventory("stock-1", "task-123", {
            quantity: 2.5,
            note: "Replaced worn belt",
          }),
        ).resolves.toEqual({ id: "movement-1" });
        expect(decrementStock).toHaveBeenCalledWith({
          where: {
            id: "stock-1",
            organizationId: "org-1",
            siteId: "site-1",
            onHand: { gte: "2.50" },
          },
          data: { onHand: { decrement: "2.50" } },
        });
        expect(createMovement).toHaveBeenCalledWith({
          data: {
            inventoryItemId: "stock-1",
            organizationId: "org-1",
            taskId: "task-123",
            type: "CONSUMPTION",
            quantity: "2.50",
            note: "Replaced worn belt",
            recordedById: "user-1",
          },
        });
      } finally {
        transaction.mockRestore();
      }
    });

    it("rejects consumption that would make stock negative", async () => {
      const createMovement = vi.fn();
      const fakeTx = {
        maintenanceTask: {
          findFirst: vi.fn().mockResolvedValue({ id: "task-123" }),
        },
        inventoryItem: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        inventoryMovement: { create: createMovement },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await expect(
          consumeInventory("stock-1", "task-123", { quantity: 4 }),
        ).rejects.toThrow("Inventory item not found or insufficient stock");
        expect(createMovement).not.toHaveBeenCalled();
      } finally {
        transaction.mockRestore();
      }
    });

    it("initializes the completion timestamp when a task first becomes completed", async () => {
      const completedAt = new Date("2026-12-20T17:15:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(completedAt);
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime: new Date("2026-12-20T08:00:00.000Z"),
        equipmentId: "eq-1",
        maintenancePointId: null,
        status: "scheduled",
        completedAt: null,
        assignments: [],
      } as never);
      const updateTaskRecord = vi.fn(async (args: any) => ({
        id: "task-123",
        ...args.data,
      }));
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) =>
          callback({ maintenanceTask: { update: updateTaskRecord } }),
        );

      try {
        await updateTask("task-123", { status: "completed" });

        expect(updateTaskRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              status: "completed",
              completedAt,
            },
          }),
        );
      } finally {
        transaction.mockRestore();
        vi.useRealTimers();
      }
    });

    it("preserves an existing completion timestamp when reopening and editing a task", async () => {
      const completedAt = new Date("2026-12-19T17:15:00.000Z");
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime: new Date("2026-12-19T08:00:00.000Z"),
        equipmentId: "eq-1",
        maintenancePointId: null,
        status: "completed",
        completedAt,
        assignments: [],
      } as never);
      const updateTaskRecord = vi.fn(async (args: any) => ({
        id: "task-123",
        ...args.data,
      }));
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) =>
          callback({ maintenanceTask: { update: updateTaskRecord } }),
        );

      try {
        await updateTask("task-123", {
          status: "scheduled",
          title: "Reopened inspection",
        });

        expect(updateTaskRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              status: "scheduled",
              title: "Reopened inspection",
              completedAt,
            },
          }),
        );
      } finally {
        transaction.mockRestore();
      }
    });

    it("does not replace a historical completion timestamp when completing the task again", async () => {
      const completedAt = new Date("2026-12-19T17:15:00.000Z");
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime: new Date("2026-12-19T08:00:00.000Z"),
        equipmentId: "eq-1",
        maintenancePointId: null,
        status: "scheduled",
        completedAt,
        assignments: [],
      } as never);
      const updateTaskRecord = vi.fn(async (args: any) => ({
        id: "task-123",
        ...args.data,
      }));
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) =>
          callback({ maintenanceTask: { update: updateTaskRecord } }),
        );

      try {
        await updateTask("task-123", { status: "completed" });

        expect(updateTaskRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              status: "completed",
              completedAt,
            },
          }),
        );
      } finally {
        transaction.mockRestore();
      }
    });

    it("updates assignments when workerLogs are provided in transaction", async () => {
      vi.mocked(prisma.worker.count).mockResolvedValue(1);
      const logStart = new Date("2026-06-01T08:30:00.000Z");
      const logEnd = new Date("2026-06-01T09:30:00.000Z");

      const deletedAssignmentTasks: string[] = [];
      const createdAssignments: any[] = [];

      const fakeTx = {
        maintenanceTaskAssignment: {
          deleteMany: async (args: any) => {
            deletedAssignmentTasks.push(args.where.taskId);
            return { count: 1 };
          },
          createMany: async (args: any) => {
            createdAssignments.push(...args.data);
            return { count: args.data.length };
          },
        },
        material: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async () => ({ count: 0 }),
        },
        maintenanceTask: {
          update: async (args: any) => ({
            id: args.where.id,
            status: args.data.status,
          }),
        },
      };

      const txMock = vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => cb(fakeTx));

      try {
        const result = await updateTask("task-123", {
          status: "completed",
          workerLogs: [{ workerId: "worker-1", startTime: logStart, endTime: logEnd }],
        });

        expect(result.id).toBe("task-123");
        expect(result.status).toBe("completed");
        expect(deletedAssignmentTasks).toEqual(["task-123"]);
        expect(createdAssignments).toEqual([
          {
            taskId: "task-123",
            workerId: "worker-1",
            organizationId: "org-1",
            startTime: logStart,
            endTime: logEnd,
          },
        ]);
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        txMock.mockRestore();
      }
    });

    it("persists an actual worker start without inventing an end time", async () => {
      vi.mocked(prisma.worker.count).mockResolvedValue(1);
      const logStart = new Date("2026-06-01T08:30:00.000Z");
      const createdAssignments: any[] = [];
      const fakeTx = {
        maintenanceTaskAssignment: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async (args: any) => {
            createdAssignments.push(...args.data);
            return { count: args.data.length };
          },
        },
        material: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async () => ({ count: 0 }),
        },
        maintenanceTask: {
          update: async (args: any) => ({ id: args.where.id }),
        },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await updateTask("task-123", {
          workerLogs: [
            { workerId: "worker-1", startTime: logStart, endTime: null },
          ],
        });

        expect(createdAssignments).toEqual([
          {
            taskId: "task-123",
            workerId: "worker-1",
            organizationId: "org-1",
            startTime: logStart,
            endTime: null,
          },
        ]);
      } finally {
        transaction.mockRestore();
      }
    });

    it("updateTask replaces materials when materials array is provided", async () => {
      const deletedMaterialsTasks: string[] = [];
      const createdMaterials: any[] = [];

      const fakeTx = {
        maintenanceTaskAssignment: {
          deleteMany: async () => ({ count: 0 }),
          createMany: async () => ({ count: 0 }),
        },
        material: {
          deleteMany: async (args: any) => {
            deletedMaterialsTasks.push(args.where.taskId);
            return { count: 1 };
          },
          createMany: async (args: any) => {
            createdMaterials.push(...args.data);
            return { count: args.data.length };
          },
        },
        maintenanceTask: {
          update: async (args: any) => ({
            id: args.where.id,
            title: args.data.title,
          }),
        },
      };

      const txMock = vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => cb(fakeTx));

      try {
        await updateTask("task-123", {
          title: "Updated Title",
          materials: [
            {
              name: "Bearing G4",
              reference: "BRG-G4",
              quantity: 2,
              unit: MaterialUnit.PC,
              price: 45.0,
            },
          ],
        });

        expect(deletedMaterialsTasks).toEqual(["task-123"]);
        expect(createdMaterials).toEqual([
          {
            taskId: "task-123",
            organizationId: "org-1",
            name: "Bearing G4",
            reference: "BRG-G4",
            quantity: 2,
            unit: MaterialUnit.PC,
            price: "45.00",
          },
        ]);
      } finally {
        txMock.mockRestore();
      }
    });

    it("shifts daily worker hours when an edited task moves to another date", async () => {
      const previousStart = new Date("2026-06-01T22:30:00.000Z");
      const nextStart = new Date("2026-06-01T23:30:00.000Z");
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime: previousStart,
        assignments: [{ workerId: "worker-1" }],
      } as never);
      vi.spyOn(prisma.worker, "count").mockResolvedValue(1);
      vi.spyOn(prisma.tenantSettings, "findUnique").mockResolvedValue({
        timezone: "Europe/Lisbon",
      } as never);
      const updateDailyHours = vi.fn();
      const fakeTx = {
        maintenanceTaskDailyHours: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "daily-log-1" }, { id: "daily-log-2" }]),
          deleteMany: vi.fn(),
          updateMany: updateDailyHours,
          createMany: vi.fn(),
        },
        maintenanceTask: {
          update: vi.fn().mockResolvedValue({ id: "task-123" }),
        },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await updateTask("task-123", {
          startTime: nextStart,
          dailyHours: [
            {
              id: "daily-log-1",
              workerId: "worker-1",
              workDate: "2026-06-01",
              startTime: "23:00",
              hours: 4,
            },
          ],
        });

        expect(updateDailyHours).toHaveBeenCalledWith({
          where: {
            id: "daily-log-1",
            taskId: "task-123",
            organizationId: "org-1",
          },
          data: {
            workerId: "worker-1",
            workDate: new Date("2026-06-02T00:00:00.000Z"),
            startTime: new Date("2026-06-02T22:00:00.000Z"),
            hours: "4.00",
          },
        });
        expect(fakeTx.maintenanceTaskDailyHours.deleteMany).toHaveBeenCalledWith({
          where: {
            taskId: "task-123",
            organizationId: "org-1",
            id: { notIn: ["daily-log-1"] },
          },
        });
      } finally {
        transaction.mockRestore();
      }
    });

    it("preserves existing work logs and creates a new log for the same worker", async () => {
      const currentTaskStart = new Date("2026-06-01T08:00:00.000Z");
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime: currentTaskStart,
        endTime: null,
        status: "scheduled",
        completedAt: null,
        equipmentId: "eq-1",
        maintenancePointId: null,
        assignments: [{ workerId: "worker-paulo" }, { workerId: "worker-fabio" }],
      } as never);
      vi.spyOn(prisma.tenantSettings, "findUnique").mockResolvedValue({
        timezone: "Europe/Lisbon",
      } as never);

      const createdWorkLogs: unknown[] = [];
      const deleteWorkLogs = vi.fn();
      const fakeTx = {
        maintenanceTaskAssignment: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        maintenanceTaskDailyHours: {
          findMany: vi.fn().mockResolvedValue([
            { id: "work-log-paulo" },
            { id: "work-log-fabio" },
          ]),
          deleteMany: deleteWorkLogs,
          updateMany: vi.fn(),
          createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
            createdWorkLogs.push(...data);
            return { count: data.length };
          }),
        },
        maintenanceTask: {
          update: vi.fn().mockResolvedValue({ id: "task-123" }),
        },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await updateTask("task-123", {
          dailyHours: [
            {
              id: "work-log-paulo",
              workerId: "worker-paulo",
              workDate: "2026-06-01",
              startTime: "08:00",
              hours: 1,
            },
            {
              id: "work-log-fabio",
              workerId: "worker-fabio",
              workDate: "2026-06-01",
              startTime: "09:00",
              hours: 1,
            },
            {
              workerId: "worker-fabio",
              workDate: "2026-06-01",
              startTime: "10:00",
              hours: 2,
            },
          ],
          workerIds: ["worker-paulo", "worker-fabio"],
          workerLogs: [
            {
              workerId: "worker-paulo",
              startTime: currentTaskStart,
              endTime: null,
            },
            {
              workerId: "worker-fabio",
              startTime: currentTaskStart,
              endTime: null,
            },
          ],
        });

        expect(
          fakeTx.maintenanceTaskAssignment.createMany,
        ).toHaveBeenCalledWith({
          data: [
            {
              taskId: "task-123",
              workerId: "worker-paulo",
              organizationId: "org-1",
              startTime: currentTaskStart,
              endTime: null,
            },
            {
              taskId: "task-123",
              workerId: "worker-fabio",
              organizationId: "org-1",
              startTime: currentTaskStart,
              endTime: null,
            },
          ],
        });
        expect(deleteWorkLogs).toHaveBeenCalledWith({
          where: {
            taskId: "task-123",
            organizationId: "org-1",
            id: { notIn: ["work-log-paulo", "work-log-fabio"] },
          },
        });
        expect(createdWorkLogs).toEqual([
          {
            taskId: "task-123",
            workerId: "worker-fabio",
            organizationId: "org-1",
            workDate: new Date("2026-06-01T00:00:00.000Z"),
            startTime: new Date("2026-06-01T09:00:00.000Z"),
            hours: "2.00",
          },
        ]);
      } finally {
        transaction.mockRestore();
      }
    });

    it("infers update starts from the same worker's latest end, not another worker's", async () => {
      const currentTaskStart = new Date("2026-07-01T07:00:00.000Z");
      vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue({
        id: "task-123",
        startTime: currentTaskStart,
        endTime: null,
        status: "scheduled",
        completedAt: null,
        equipmentId: "eq-1",
        maintenancePointId: null,
        assignments: [{ workerId: "worker-a" }, { workerId: "worker-b" }],
      } as never);
      vi.spyOn(prisma.tenantSettings, "findUnique").mockResolvedValue({
        timezone: "Europe/Lisbon",
      } as never);

      const createdWorkLogs: unknown[] = [];
      const fakeTx = {
        maintenanceTaskDailyHours: {
          findMany: vi.fn().mockResolvedValue([
            { id: "work-log-a" },
            { id: "work-log-b" },
          ]),
          deleteMany: vi.fn(),
          updateMany: vi.fn(),
          createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
            createdWorkLogs.push(...data);
            return { count: data.length };
          }),
        },
        maintenanceTask: {
          update: vi.fn().mockResolvedValue({ id: "task-123" }),
        },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await updateTask("task-123", {
          dailyHours: [
            {
              id: "work-log-a",
              workerId: "worker-a",
              workDate: "2026-07-01",
              startTime: "08:00",
              hours: 3,
            },
            {
              id: "work-log-b",
              workerId: "worker-b",
              workDate: "2026-07-01",
              startTime: "08:00",
              hours: 2,
            },
            {
              workerId: "worker-a",
              workDate: "2026-07-01",
              hours: 2,
            },
            {
              workerId: "worker-b",
              workDate: "2026-07-01",
              hours: 1,
            },
          ],
        });

        expect(createdWorkLogs).toEqual([
          {
            taskId: "task-123",
            workerId: "worker-a",
            organizationId: "org-1",
            workDate: new Date("2026-07-01T00:00:00.000Z"),
            startTime: new Date("2026-07-01T10:00:00.000Z"),
            hours: "2.00",
          },
          {
            taskId: "task-123",
            workerId: "worker-b",
            organizationId: "org-1",
            workDate: new Date("2026-07-01T00:00:00.000Z"),
            startTime: new Date("2026-07-01T09:00:00.000Z"),
            hours: "1.00",
          },
        ]);
      } finally {
        transaction.mockRestore();
      }
    });

    it("clears assignments and materials when explicit empty arrays are provided", async () => {
      const deletedAssignment = vi.fn().mockResolvedValue({ count: 2 });
      const createdAssignments = vi.fn();
      const deletedMaterials = vi.fn().mockResolvedValue({ count: 3 });
      const createdMaterials = vi.fn();
      const updateTaskRecord = vi.fn().mockResolvedValue({ id: "task-123" });
      const fakeTx = {
        maintenanceTaskAssignment: {
          deleteMany: deletedAssignment,
          createMany: createdAssignments,
        },
        material: {
          deleteMany: deletedMaterials,
          createMany: createdMaterials,
        },
        maintenanceTask: { update: updateTaskRecord },
      };
      const txMock = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await updateTask("task-123", { workerIds: [], materials: [] });

        expect(deletedAssignment).toHaveBeenCalledWith({
          where: { taskId: "task-123", organizationId: "org-1" },
        });
        expect(deletedMaterials).toHaveBeenCalledWith({
          where: { taskId: "task-123", organizationId: "org-1" },
        });
        expect(createdAssignments).not.toHaveBeenCalled();
        expect(createdMaterials).not.toHaveBeenCalled();
        expect(updateTaskRecord).toHaveBeenCalledTimes(1);
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/");
      } finally {
        txMock.mockRestore();
      }
    });

    it("deleteTask moves the task to the trash and revalidates path", async () => {
      const update = vi.spyOn(prisma.maintenanceTask, "updateMany").mockResolvedValue({ count: 1 });

      await deleteTask("task-123");

      expect(update).toHaveBeenCalledWith({
        where: {
          id: "task-123",
          organizationId: "org-1",
          deletedAt: null,
          equipment: { is: { siteId: "site-1" } },
        },
        data: { deletedAt: expect.any(Date), deletedById: "user-1" },
      });
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
    });

    it("moves the task and shifts work-log dates without changing assignment logs", async () => {
      const newStart = new Date("2026-06-01T23:30:00.000Z");
      const newEnd = new Date("2026-06-02T00:30:00.000Z");
      const oldStart = new Date("2026-06-01T22:30:00.000Z");
      const oldEnd = new Date("2026-06-01T23:30:00.000Z");
      vi.spyOn(prisma.tenantSettings, "findUnique").mockResolvedValue({
        timezone: "Europe/Lisbon",
      } as never);
      const fakeTx = {
        maintenanceTask: {
          findFirst: vi.fn().mockResolvedValue({
            startTime: oldStart,
            endTime: oldEnd,
          }),
          update: vi.fn().mockResolvedValue({
            id: "task-123",
            startTime: newStart,
            endTime: newEnd,
            equipmentId: "eq-new",
          }),
        },
        maintenanceTaskAssignment: {
          findMany: vi.fn().mockResolvedValue([
            { id: "assignment-1", startTime: oldStart, endTime: oldEnd },
          ]),
          update: vi.fn(),
        },
        maintenanceTaskDailyHours: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "daily-log-1",
              workerId: "worker-1",
              workDate: new Date("2026-06-01T00:00:00.000Z"),
              startTime: null,
              hours: "4.00",
            },
          ]),
          updateMany: vi.fn(),
        },
      };
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        const result = await moveTask("task-123", newStart, "eq-new");
        expect(result.id).toBe("task-123");
        expect(fakeTx.maintenanceTask.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: "task-123",
              organizationId: "org-1",
              equipment: { is: { siteId: "site-1" } },
            },
            data: {
              startTime: newStart,
              endTime: newEnd,
              equipmentId: "eq-new",
            },
            include: {
              equipment: true,
              assignments: { include: { worker: true } },
              dailyHours: true,
              materials: true,
              checklistItems: { orderBy: { sortOrder: "asc" } },
            },
          }),
        );
        expect(fakeTx.maintenanceTaskAssignment.findMany).not.toHaveBeenCalled();
        expect(fakeTx.maintenanceTaskAssignment.update).not.toHaveBeenCalled();
        expect(fakeTx.maintenanceTaskDailyHours.updateMany).toHaveBeenCalledWith({
          where: {
            id: "daily-log-1",
            taskId: "task-123",
            organizationId: "org-1",
          },
          data: {
            workDate: new Date("2026-06-02T00:00:00.000Z"),
          },
        });
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        transaction.mockRestore();
      }
    });

    it("rejects an invalid move date before updating the database", async () => {
      const updateMock = vi.spyOn(prisma.maintenanceTask, "update");

      await expect(
        moveTask("task-123", new Date("invalid")),
      ).rejects.toThrow("Task start time is invalid");

      expect(updateMock).not.toHaveBeenCalled();
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
      updateMock.mockRestore();
    });

    it("propagates transaction failures without revalidating the route", async () => {
      const transactionError = new Error("material insert failed");
      const fakeTx = {
        maintenanceTaskAssignment: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        material: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          createMany: vi.fn().mockRejectedValue(transactionError),
        },
        maintenanceTask: { update: vi.fn() },
      };
      const txMock = vi
        .spyOn(prisma, "$transaction")
        .mockImplementation(async (callback: any) => callback(fakeTx));

      try {
        await expect(
          updateTask("task-123", {
            materials: [{ name: "Bearing", quantity: 1 }],
          }),
        ).rejects.toBe(transactionError);
        expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
      } finally {
        txMock.mockRestore();
      }
    });
  });
});
