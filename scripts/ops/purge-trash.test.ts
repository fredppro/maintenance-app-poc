import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteTasks: vi.fn(),
  deleteEquipment: vi.fn(),
  deleteWorkers: vi.fn(),
}));

vi.mock("../../prisma/seed-env", () => ({}));
vi.mock("../../src/lib/prisma", () => ({
  default: {
    maintenanceTask: { deleteMany: mocks.deleteTasks },
    equipment: { deleteMany: mocks.deleteEquipment },
    worker: { deleteMany: mocks.deleteWorkers },
    $disconnect: vi.fn(),
  },
}));

import { purgeTrash } from "./purge-trash";

describe("purgeTrash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteTasks.mockResolvedValue({ count: 1 });
    mocks.deleteEquipment.mockResolvedValue({ count: 2 });
    mocks.deleteWorkers.mockResolvedValue({ count: 3 });
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid retention days (%s) before deleting records",
    async (days) => {
      await expect(purgeTrash(days)).rejects.toThrow(
        "Trash retention days must be a non-negative integer",
      );
      expect(mocks.deleteTasks).not.toHaveBeenCalled();
      expect(mocks.deleteEquipment).not.toHaveBeenCalled();
      expect(mocks.deleteWorkers).not.toHaveBeenCalled();
    },
  );

  it("deletes old tasks before equipment and workers", async () => {
    const now = new Date("2026-11-06T00:00:00.000Z");
    await expect(purgeTrash(30, now)).resolves.toEqual({
      tasks: 1,
      equipment: 2,
      workers: 3,
    });
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    expect(mocks.deleteTasks).toHaveBeenCalledWith({
      where: { deletedAt: { lt: cutoff } },
    });
    expect(mocks.deleteTasks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteEquipment.mock.invocationCallOrder[0],
    );
    expect(mocks.deleteEquipment.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteWorkers.mock.invocationCallOrder[0],
    );
  });
});
