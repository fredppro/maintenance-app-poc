import assert from "node:assert/strict";
import test, { describe, mock, beforeEach, afterEach } from "node:test";
import prisma from "@/lib/prisma";
import * as nextCache from "next/cache";
import {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
} from "./actions";
import { WorkerType } from "../../../../prisma/generated/prisma/enums";

describe("worker server actions", () => {
  let revalidateMock: any;

  beforeEach(() => {
    revalidateMock = mock.method(nextCache, "revalidatePath", () => {});
  });

  afterEach(() => {
    revalidateMock?.mock?.restore();
  });

  test("getWorkers queries workers ordered by name ascending", async () => {
    const mockWorkers = [
      { id: "w-1", name: "Alice", email: "alice@example.com" },
      { id: "w-2", name: "Bob", email: "bob@example.com" },
    ];

    const findManyMock = mock.method(prisma.worker, "findMany", async (args: any) => {
      assert.deepStrictEqual(args.orderBy, { name: "asc" });
      return mockWorkers as any;
    });

    try {
      const result = await getWorkers();
      assert.deepStrictEqual(result, mockWorkers);
      assert.strictEqual(findManyMock.mock.calls.length, 1);
    } finally {
      findManyMock.mock.restore();
    }
  });

  test("createWorker creates internal worker by default and revalidates path", async () => {
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

    const createMock = mock.method(prisma.worker, "create", async (args: any) => {
      assert.deepStrictEqual(args.data, {
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
      assert.deepStrictEqual(result, created);
      assert.strictEqual(revalidateMock.mock.calls.length, 1);
      assert.strictEqual(revalidateMock.mock.calls[0].arguments[0], "/");
    } finally {
      createMock.mock.restore();
    }
  });

  test("createWorker creates external worker with vendorId and phone", async () => {
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

    const createMock = mock.method(prisma.worker, "create", async (args: any) => {
      assert.deepStrictEqual(args.data, workerInput);
      return created as any;
    });

    try {
      const result = await createWorker(workerInput);
      assert.deepStrictEqual(result, created);
      assert.strictEqual(revalidateMock.mock.calls.length, 1);
    } finally {
      createMock.mock.restore();
    }
  });

  test("updateWorker updates worker fields and revalidates path", async () => {
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

    const updateMock = mock.method(prisma.worker, "update", async (args: any) => {
      assert.strictEqual(args.where.id, "w-3");
      assert.deepStrictEqual(args.data, updateData);
      return updated as any;
    });

    try {
      const result = await updateWorker("w-3", updateData);
      assert.deepStrictEqual(result, updated);
      assert.strictEqual(revalidateMock.mock.calls.length, 1);
    } finally {
      updateMock.mock.restore();
    }
  });

  test("deleteWorker deletes worker by id and revalidates path", async () => {
    const deleteMock = mock.method(prisma.worker, "delete", async (args: any) => {
      assert.strictEqual(args.where.id, "w-3");
      return { id: "w-3" } as any;
    });

    try {
      await deleteWorker("w-3");
      assert.strictEqual(deleteMock.mock.calls.length, 1);
      assert.strictEqual(revalidateMock.mock.calls.length, 1);
    } finally {
      deleteMock.mock.restore();
    }
  });
});
