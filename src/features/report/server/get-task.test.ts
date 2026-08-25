import assert from "node:assert/strict";
import test, { describe, mock } from "node:test";
import prisma from "@/lib/prisma";
import { getMaintenanceTask } from "./get-task";

describe("getMaintenanceTask", () => {
  test("queries maintenance task with equipment, assignments (and workers), and materials included", async () => {
    const mockTask = {
      id: "task-123",
      title: "Test Task",
      equipment: { id: "eq-1", name: "Turbine" },
      assignments: [{ id: "as-1", worker: { id: "w-1", name: "John Doe" } }],
      materials: [{ id: "mat-1", name: "Filter", quantity: 2 }],
    };

    const findUniqueMock = mock.method(
      prisma.maintenanceTask,
      "findUnique",
      async (args: any) => {
        assert.strictEqual(args.where.id, "task-123");
        assert.strictEqual(args.include.equipment, true);
        assert.strictEqual(args.include.materials, true);
        assert.strictEqual(args.include.assignments.include.worker, true);
        return mockTask as any;
      }
    );

    try {
      const task = await getMaintenanceTask("task-123");
      assert.deepStrictEqual(task, mockTask);
      assert.strictEqual(findUniqueMock.mock.calls.length, 1);
    } finally {
      findUniqueMock.mock.restore();
    }
  });
});
