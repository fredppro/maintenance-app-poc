import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import {
  getEquipment,
  addEquipment,
  updateEquipment,
  deleteEquipment,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  moveTask,
} from "./actions";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("scheduler server actions", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  afterEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  describe("equipment actions", () => {
    it("getEquipment orders by name ascending", async () => {
      const mockEquipments = [{ id: "eq-1", name: "Conveyor" }];
      const findManyMock = vi.spyOn(prisma.equipment, "findMany").mockResolvedValue(mockEquipments as any);

      try {
        const result = await getEquipment();
        expect(result).toEqual(mockEquipments);
        expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { name: "asc" } }));
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
        expect(result).toEqual(created);
        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ data: newEquip }));
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
          expect.objectContaining({ where: { id: "eq-2" }, data: updateData }),
        );
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        updateMock.mockRestore();
      }
    });

    it("deleteEquipment deletes record and revalidates path", async () => {
      const deleteMock = vi.spyOn(prisma.equipment, "delete").mockResolvedValue({ id: "eq-2" } as any);

      try {
        await deleteEquipment("eq-2");
        expect(deleteMock.mock.calls.length).toBe(1);
        expect(deleteMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "eq-2" } }));
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        deleteMock.mockRestore();
      }
    });
  });

  describe("task actions", () => {
    it("getTasks queries tasks with equipment, worker assignments, and materials ordered by startTime", async () => {
      const mockTasks = [{ id: "task-1", title: "Maintenance 1" }];
      const findManyMock = vi.spyOn(prisma.maintenanceTask, "findMany").mockResolvedValue(mockTasks as any);

      try {
        const result = await getTasks();
        expect(result).toEqual(mockTasks);
        expect(findManyMock).toHaveBeenCalledWith(
          expect.objectContaining({
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
              assignments: { create: [{ workerId: "worker-1" }, { workerId: "worker-2" }] },
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

    it("deleteTask deletes task and revalidates path", async () => {
      const deleteMock = vi
        .spyOn(prisma.maintenanceTask, "delete")
        .mockResolvedValue({ id: "task-123" } as any);

      try {
        await deleteTask("task-123");
        expect(deleteMock.mock.calls.length).toBe(1);
        expect(deleteMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "task-123" } }));
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
            where: { id: "task-123" },
            data: { startTime: newStart, endTime: newEnd, equipmentId: "eq-new" },
            include: { equipment: true, assignments: { include: { worker: true } } },
          }),
        );
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      } finally {
        updateMock.mockRestore();
      }
    });
  });
});
