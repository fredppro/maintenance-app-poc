import assert from "node:assert/strict";
import test, { describe, mock, beforeEach, afterEach } from "node:test";
import prisma from "@/lib/prisma";
import * as nextCache from "next/cache";
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

describe("scheduler server actions", () => {
  let revalidateMock: any;

  beforeEach(() => {
    revalidateMock = mock.method(nextCache, "revalidatePath", () => {});
  });

  afterEach(() => {
    revalidateMock?.mock?.restore();
  });

  describe("equipment actions", () => {
    test("getEquipment orders by name ascending", async () => {
      const mockEquipments = [{ id: "eq-1", name: "Conveyor" }];
      const findManyMock = mock.method(prisma.equipment, "findMany", async (args: any) => {
        assert.deepStrictEqual(args.orderBy, { name: "asc" });
        return mockEquipments as any;
      });

      try {
        const result = await getEquipment();
        assert.deepStrictEqual(result, mockEquipments);
      } finally {
        findManyMock.mock.restore();
      }
    });

    test("addEquipment creates record and revalidates path", async () => {
      const newEquip = { name: "Press B", category: "Heavy" };
      const created = { id: "eq-2", ...newEquip, createdAt: new Date() };

      const createMock = mock.method(prisma.equipment, "create", async (args: any) => {
        assert.deepStrictEqual(args.data, newEquip);
        return created as any;
      });

      try {
        const result = await addEquipment(newEquip);
        assert.deepStrictEqual(result, created);
        assert.strictEqual(revalidateMock.mock.calls.length, 1);
        assert.strictEqual(revalidateMock.mock.calls[0].arguments[0], "/");
      } finally {
        createMock.mock.restore();
      }
    });

    test("updateEquipment updates record and revalidates path", async () => {
      const updateData = { name: "Press B (Modified)" };
      const updated = { id: "eq-2", name: "Press B (Modified)", category: "Heavy", createdAt: new Date() };

      const updateMock = mock.method(prisma.equipment, "update", async (args: any) => {
        assert.strictEqual(args.where.id, "eq-2");
        assert.deepStrictEqual(args.data, updateData);
        return updated as any;
      });

      try {
        const result = await updateEquipment("eq-2", updateData);
        assert.deepStrictEqual(result, updated);
        assert.strictEqual(revalidateMock.mock.calls.length, 1);
      } finally {
        updateMock.mock.restore();
      }
    });

    test("deleteEquipment deletes record and revalidates path", async () => {
      const deleteMock = mock.method(prisma.equipment, "delete", async (args: any) => {
        assert.strictEqual(args.where.id, "eq-2");
        return { id: "eq-2" } as any;
      });

      try {
        await deleteEquipment("eq-2");
        assert.strictEqual(deleteMock.mock.calls.length, 1);
        assert.strictEqual(revalidateMock.mock.calls.length, 1);
      } finally {
        deleteMock.mock.restore();
      }
    });
  });

  describe("task actions", () => {
    test("getTasks queries tasks with equipment, worker assignments, and materials ordered by startTime", async () => {
      const mockTasks = [{ id: "task-1", title: "Maintenance 1" }];
      const findManyMock = mock.method(prisma.maintenanceTask, "findMany", async (args: any) => {
        assert.strictEqual(args.include.equipment, true);
        assert.strictEqual(args.include.materials, true);
        assert.strictEqual(args.include.assignments.include.worker, true);
        assert.deepStrictEqual(args.orderBy, { startTime: "asc" });
        return mockTasks as any;
      });

      try {
        const result = await getTasks();
        assert.deepStrictEqual(result, mockTasks);
      } finally {
        findManyMock.mock.restore();
      }
    });

    test("createTask creates assignments and materials relations with formatted prices", async () => {
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

      const createMock = mock.method(prisma.maintenanceTask, "create", async (args: any) => {
        assert.strictEqual(args.data.title, "Oil Change");
        assert.strictEqual(args.data.equipmentId, "eq-1");
        assert.deepStrictEqual(args.data.assignments.create, [
          { workerId: "worker-1" },
          { workerId: "worker-2" },
        ]);
        assert.deepStrictEqual(args.data.materials.create, [
          {
            name: "Synthetic Oil 5W30",
            reference: "OIL-5W30",
            quantity: 5,
            unit: MaterialUnit.L,
            price: "12.50",
          },
        ]);
        return { id: "task-new", ...taskInput } as any;
      });

      try {
        const result = await createTask(taskInput);
        assert.strictEqual(result.id, "task-new");
        assert.strictEqual(revalidateMock.mock.calls.length, 1);
      } finally {
        createMock.mock.restore();
      }
    });

    test("updateTask updates assignments when workerLogs are provided in transaction", async () => {
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

      const txMock = mock.method(prisma, "$transaction", async (cb: any) => {
        return cb(fakeTx);
      });

      try {
        const result = await updateTask("task-123", {
          status: "completed",
          workerLogs: [{ workerId: "worker-1", startTime: logStart, endTime: logEnd }],
        });

        assert.strictEqual(result.id, "task-123");
        assert.strictEqual(result.status, "completed");
        assert.deepStrictEqual(deletedAssignmentTasks, ["task-123"]);
        assert.deepStrictEqual(createdAssignments, [
          {
            taskId: "task-123",
            workerId: "worker-1",
            startTime: logStart,
            endTime: logEnd,
          },
        ]);
        assert.strictEqual(revalidateMock.mock.calls.length, 1);
      } finally {
        txMock.mock.restore();
      }
    });

    test("updateTask replaces materials when materials array is provided", async () => {
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

      const txMock = mock.method(prisma, "$transaction", async (cb: any) => {
        return cb(fakeTx);
      });

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

        assert.deepStrictEqual(deletedMaterialsTasks, ["task-123"]);
        assert.deepStrictEqual(createdMaterials, [
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
        txMock.mock.restore();
      }
    });

    test("deleteTask deletes task and revalidates path", async () => {
      const deleteMock = mock.method(prisma.maintenanceTask, "delete", async (args: any) => {
        assert.strictEqual(args.where.id, "task-123");
        return { id: "task-123" } as any;
      });

      try {
        await deleteTask("task-123");
        assert.strictEqual(deleteMock.mock.calls.length, 1);
        assert.strictEqual(revalidateMock.mock.calls.length, 1);
      } finally {
        deleteMock.mock.restore();
      }
    });

    test("moveTask updates start/end time and equipmentId", async () => {
      const newStart = new Date("2026-07-01T10:00:00.000Z");
      const newEnd = new Date("2026-07-01T12:00:00.000Z");

      const updateMock = mock.method(prisma.maintenanceTask, "update", async (args: any) => {
        assert.strictEqual(args.where.id, "task-123");
        assert.strictEqual(args.data.startTime, newStart);
        assert.strictEqual(args.data.endTime, newEnd);
        assert.strictEqual(args.data.equipmentId, "eq-new");
        assert.strictEqual(args.include.equipment, true);
        assert.strictEqual(args.include.assignments.include.worker, true);
        return { id: "task-123", startTime: newStart, endTime: newEnd, equipmentId: "eq-new" } as any;
      });

      try {
        const result = await moveTask("task-123", newStart, newEnd, "eq-new");
        assert.strictEqual(result.id, "task-123");
        assert.strictEqual(revalidateMock.mock.calls.length, 1);
      } finally {
        updateMock.mock.restore();
      }
    });
  });
});
