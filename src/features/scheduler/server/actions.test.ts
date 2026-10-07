import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import {
  getEquipment,
  addEquipment,
  updateEquipment,
  relocateEquipment,
  deleteEquipment,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  moveTask,
} from "./actions";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";
import { getTenantContext } from "@/lib/tenant-context";

vi.mock("@/lib/tenant-context", () => ({
  getTenantContext: vi.fn().mockResolvedValue({
    userId: "user-1",
    organizationId: "org-1",
    siteId: "site-1",
    siteName: "Plant",
    role: "owner",
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("scheduler server actions", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(getTenantContext).mockClear();
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
                organizationId: "org-1",
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
                organizationId: "org-1",
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

    it("deleteEquipment deletes record and revalidates path", async () => {
      const deleteMock = vi.spyOn(prisma.equipment, "delete").mockResolvedValue({ id: "eq-2" } as any);

      try {
        await deleteEquipment("eq-2");
        expect(getTenantContext).toHaveBeenCalledWith("deleteMaintenance");
        expect(deleteMock.mock.calls.length).toBe(1);
        expect(deleteMock).toHaveBeenCalledWith({
          where: { id: "eq-2", organizationId: "org-1", siteId: "site-1" },
        });
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        deleteMock.mockRestore();
      }
    });
  });

  describe("task actions", () => {
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
          select: { id: true },
        });
        expect(updateMock).not.toHaveBeenCalled();
        expect(transactionMock).not.toHaveBeenCalled();
      } finally {
        taskLookup.mockRestore();
        updateMock.mockRestore();
        transactionMock.mockRestore();
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
            include: {
              equipment: true,
              materials: true,
              assignments: { include: { worker: true } },
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

    it("updateTask updates assignments when workerLogs are provided in transaction", async () => {
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

    it("deleteTask deletes task and revalidates path", async () => {
      const deleteMock = vi
        .spyOn(prisma.maintenanceTask, "delete")
        .mockResolvedValue({ id: "task-123" } as any);

      try {
        await deleteTask("task-123");
        expect(deleteMock.mock.calls.length).toBe(1);
        expect(deleteMock).toHaveBeenCalledWith(expect.objectContaining({
          where: {
            id: "task-123",
            organizationId: "org-1",
            equipment: { is: { siteId: "site-1" } },
          },
        }));
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        deleteMock.mockRestore();
      }
    });

    it("moveTask updates start/end time and equipmentId", async () => {
      const newStart = new Date("2026-07-01T10:00:00.000Z");
      const newEnd = new Date("2026-07-01T12:00:00.000Z");

      const updateMock = vi.spyOn(prisma.maintenanceTask, "update").mockResolvedValue(
        { id: "task-123", startTime: newStart, endTime: newEnd, equipmentId: "eq-new" } as any,
      );

      try {
        const result = await moveTask("task-123", newStart, newEnd, "eq-new");
        expect(result.id).toBe("task-123");
        expect(updateMock).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: "task-123",
              organizationId: "org-1",
              equipment: { is: { siteId: "site-1" } },
            },
            data: { startTime: newStart, endTime: newEnd, equipmentId: "eq-new" },
            include: { equipment: true, assignments: { include: { worker: true } } },
          }),
        );
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        updateMock.mockRestore();
      }
    });

    it("rejects invalid move intervals before updating the database", async () => {
      const updateMock = vi.spyOn(prisma.maintenanceTask, "update");

      await expect(
        moveTask(
          "task-123",
          new Date("2026-07-01T12:00:00.000Z"),
          new Date("2026-07-01T10:00:00.000Z"),
        ),
      ).rejects.toThrow("Task end time must be after start time");

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
