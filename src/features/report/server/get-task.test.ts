import { describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import { getMaintenanceTask } from "./get-task";

describe("getMaintenanceTask", () => {
  it("queries maintenance task with equipment, assignments (and workers), and materials included", async () => {
    const mockTask = {
      id: "task-123",
      title: "Test Task",
      equipment: { id: "eq-1", name: "Turbine" },
      assignments: [{ id: "as-1", worker: { id: "w-1", name: "John Doe" } }],
      materials: [{ id: "mat-1", name: "Filter", quantity: 2 }],
    };

    const findUniqueMock = vi.spyOn(prisma.maintenanceTask, "findUnique").mockImplementation(async (args: any) => {
      expect(args.where.id).toBe("task-123");
      expect(args.include.equipment).toBe(true);
      expect(args.include.materials).toBe(true);
      expect(args.include.assignments.include.worker).toBe(true);
      return mockTask as any;
    });

    try {
      const task = await getMaintenanceTask("task-123");
      expect(task).toEqual(mockTask);
      expect(findUniqueMock.mock.calls.length).toBe(1);
    } finally {
      findUniqueMock.mockRestore();
    }
  });
});
