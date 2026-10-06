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

    const findUniqueMock = vi.spyOn(prisma.maintenanceTask, "findFirst").mockResolvedValue(mockTask as any);

    try {
      const task = await getMaintenanceTask("task-123", "org-1", "site-1");
      expect(task).toEqual(mockTask);
      expect(findUniqueMock.mock.calls.length).toBe(1);
      expect(findUniqueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "task-123",
            organizationId: "org-1",
            equipment: { is: { siteId: "site-1" } },
          },
          include: {
            equipment: true,
            materials: true,
            assignments: { include: { worker: true } },
          },
        }),
      );
    } finally {
      findUniqueMock.mockRestore();
    }
  });
});
