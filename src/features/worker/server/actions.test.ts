import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
} from "./actions";
import { WorkerType } from "../../../../prisma/generated/prisma/enums";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("worker server actions", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  afterEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it("getWorkers queries workers ordered by name ascending", async () => {
    const mockWorkers = [
      { id: "w-1", name: "Alice", email: "alice@example.com" },
      { id: "w-2", name: "Bob", email: "bob@example.com" },
    ];

    const findManyMock = vi.spyOn(prisma.worker, "findMany").mockImplementation(async (args: any) => {
      expect(args.orderBy).toEqual({ name: "asc" });
      return mockWorkers as any;
    });

    try {
      const result = await getWorkers();
      expect(result).toEqual(mockWorkers);
      expect(findManyMock.mock.calls.length).toBe(1);
    } finally {
      findManyMock.mockRestore();
    }
  });

  it("createWorker creates internal worker by default and revalidates path", async () => {
    const workerInput = {
      name: "Carlos Silva",
      email: "carlos@example.com",
    };

    const created = {
      id: "w-3",
      name: "Carlos Silva",
      email: "carlos@example.com",
      phone: null,
      type: WorkerType.INTERNAL,
      vendorId: null,
      createdAt: new Date(),
    };

    const createMock = vi.spyOn(prisma.worker, "create").mockImplementation(async (args: any) => {
      expect(args.data).toEqual({
        name: "Carlos Silva",
        email: "carlos@example.com",
        phone: null,
        type: WorkerType.INTERNAL,
        vendorId: null,
      });
      return created as any;
    });

    try {
      const result = await createWorker(workerInput);
      expect(result).toEqual(created);
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/");
    } finally {
      createMock.mockRestore();
    }
  });

  it("createWorker creates external worker with vendorId and phone", async () => {
    const workerInput = {
      name: "Dave External",
      email: "dave@vendor.com",
      phone: "+351912345678",
      type: WorkerType.EXTERNAL,
      vendorId: "vendor-1",
    };

    const created = {
      id: "w-4",
      ...workerInput,
      createdAt: new Date(),
    };

    const createMock = vi.spyOn(prisma.worker, "create").mockImplementation(async (args: any) => {
      expect(args.data).toEqual(workerInput);
      return created as any;
    });

    try {
      const result = await createWorker(workerInput);
      expect(result).toEqual(created);
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
    } finally {
      createMock.mockRestore();
    }
  });

  it("updateWorker updates worker fields and revalidates path", async () => {
    const updateData = {
      name: "Carlos Silva Jr.",
      phone: "+351999999999",
    };

    const updated = {
      id: "w-3",
      name: "Carlos Silva Jr.",
      email: "carlos@example.com",
      phone: "+351999999999",
      type: WorkerType.INTERNAL,
      vendorId: null,
      createdAt: new Date(),
    };

    const updateMock = vi.spyOn(prisma.worker, "update").mockImplementation(async (args: any) => {
      expect(args.where.id).toBe("w-3");
      expect(args.data).toEqual(updateData);
      return updated as any;
    });

    try {
      const result = await updateWorker("w-3", updateData);
      expect(result).toEqual(updated);
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
    } finally {
      updateMock.mockRestore();
    }
  });

  it("deleteWorker deletes worker by id and revalidates path", async () => {
    const deleteMock = vi.spyOn(prisma.worker, "delete").mockImplementation(async (args: any) => {
      expect(args.where.id).toBe("w-3");
      return { id: "w-3" } as any;
    });

    try {
      await deleteWorker("w-3");
      expect(deleteMock.mock.calls.length).toBe(1);
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledTimes(1);
    } finally {
      deleteMock.mockRestore();
    }
  });
});
