import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import prisma from "@/lib/prisma";
import {
  deleteStoredFile,
  FileValidationError,
  MAX_FILE_BYTES,
  processStoredFileDeletion,
  readStoredFile,
  saveImageFile,
} from "./files";

const storage = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({ getStorage: () => storage }));

let PNG: Buffer;
let JPEG: Buffer;
let WEBP: Buffer;
let input: Parameters<typeof saveImageFile>[0];

function makeTenantDb() {
  const db = {
    storedFile: {
      create: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    storedFileDeletion: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    transaction: vi.fn(),
  };
  db.transaction.mockImplementation(
    async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
  );
  return db;
}

beforeAll(async () => {
  const image = sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  });
  PNG = await image.clone().png().toBuffer();
  JPEG = await image.clone().jpeg().toBuffer();
  WEBP = await image.clone().webp().toBuffer();
  input = {
    db: prisma as never,
    organizationId: "org-1",
    userId: "u-1",
    filename: "pump.png",
    bytes: PNG,
  };
});

describe("file storage service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storage.put.mockReset().mockResolvedValue(undefined);
    storage.get.mockReset();
    storage.delete.mockReset().mockResolvedValue(undefined);
  });

  it.each([
    ["empty files", Buffer.alloc(0)],
    ["oversized files", Buffer.alloc(MAX_FILE_BYTES + 1, 0x89)],
    ["non-image content", Buffer.from("<script>alert(1)</script>")],
    ["a RIFF container that is not WEBP", Buffer.from("RIFF0000WAVE")],
    ["a truncated PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ])("rejects %s without touching storage", async (_label, bytes) => {
    await expect(saveImageFile({ ...input, bytes })).rejects.toBeInstanceOf(
      FileValidationError,
    );
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("stores the object under the organization prefix and records metadata", async () => {
    const create = vi.spyOn(prisma.storedFile, "create").mockResolvedValue({ id: "f-1" } as never);
    await saveImageFile({ ...input, filename: "../we ird:name?.png" });

    const key = storage.put.mock.calls[0][0] as string;
    const storedBytes = storage.put.mock.calls[0][1] as Buffer;
    const metadata = await sharp(storedBytes).metadata();
    expect(key).toMatch(/^org-1\/[0-9a-f-]+\.png$/);
    expect(storage.put).toHaveBeenCalledWith(key, storedBytes, "image/png");
    expect(metadata).toMatchObject({ format: "png", width: 1, height: 1 });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        uploadedById: "u-1",
        key,
        contentType: "image/png",
        size: storedBytes.length,
        filename: ".._we ird_name_.png",
      }),
    });
  });

  it.each([
    ["JPEG", "image/jpeg", () => JPEG],
    ["WebP", "image/webp", () => WEBP],
  ] as const)("decodes and re-encodes %s images", async (_name, contentType, getBytes) => {
    vi.spyOn(prisma.storedFile, "create").mockResolvedValue({ id: "f-1" } as never);
    await saveImageFile({ ...input, bytes: getBytes() });
    const storedBytes = storage.put.mock.calls[0][1] as Buffer;
    const metadata = await sharp(storedBytes).metadata();
    expect(metadata.format).toBe(contentType.slice("image/".length));
  });

  it("resizes large images to the storage dimension limit", async () => {
    vi.spyOn(prisma.storedFile, "create").mockResolvedValue({ id: "f-1" } as never);
    const wideImage = await sharp({
      create: {
        width: 5_000,
        height: 1,
        channels: 3,
        background: { r: 12, g: 34, b: 56 },
      },
    }).png().toBuffer();

    await saveImageFile({ ...input, bytes: wideImage });
    const storedBytes = storage.put.mock.calls[0][1] as Buffer;
    await expect(sharp(storedBytes).metadata()).resolves.toMatchObject({
      width: 4_096,
      height: 1,
    });
  });

  it("rejects images exceeding dimension and decoded-pixel limits", async () => {
    const tooWide = await sharp({
      create: {
        width: 9_000,
        height: 1,
        channels: 3,
        background: { r: 12, g: 34, b: 56 },
      },
    }).png().toBuffer();
    const tooManyPixels = await sharp({
      create: {
        width: 4_100,
        height: 4_000,
        channels: 3,
        background: { r: 12, g: 34, b: 56 },
      },
    }).png().toBuffer();

    await expect(saveImageFile({ ...input, bytes: tooWide })).rejects.toBeInstanceOf(
      FileValidationError,
    );
    await expect(
      saveImageFile({ ...input, bytes: tooManyPixels }),
    ).rejects.toBeInstanceOf(FileValidationError);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("removes uploaded bytes and any ambiguous metadata after a write failure", async () => {
    const db = makeTenantDb();
    db.storedFile.create.mockRejectedValue(new Error("db down"));
    db.storedFileDeletion.upsert.mockResolvedValue({ id: "delete-1" });
    db.storedFileDeletion.findFirst.mockImplementation(
      (() =>
        Promise.resolve({
          id: "delete-1",
          organizationId: "org-1",
          key: storage.put.mock.calls[0]![0] as string,
          attempts: 0,
        })) as never,
    );
    db.storedFileDeletion.updateMany.mockResolvedValue({ count: 1 });

    await expect(saveImageFile({ ...input, db: db as never })).rejects.toThrow("db down");
    expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
    expect(db.storedFileDeletion.upsert).toHaveBeenCalled();
    expect(db.storedFileDeletion.deleteMany).toHaveBeenCalledWith({
      where: { id: "delete-1" },
    });
  });

  it("queues a durable deletion when metadata and object cleanup both fail", async () => {
    const db = makeTenantDb();
    db.storedFile.create.mockRejectedValue(new Error("db down"));
    storage.delete.mockRejectedValue(new Error("storage down"));
    const enqueue = db.storedFileDeletion.upsert.mockResolvedValue({ id: "delete-1" });
    db.storedFileDeletion.findFirst.mockImplementation(
      (() =>
        Promise.resolve({
          id: "delete-1",
          organizationId: "org-1",
          key: storage.put.mock.calls[0]![0] as string,
          attempts: 0,
        })) as never,
    );
    db.storedFileDeletion.updateMany.mockResolvedValue({ count: 1 });

    await expect(saveImageFile({ ...input, db: db as never })).rejects.toThrow("db down");
    const key = storage.put.mock.calls[0][0] as string;
    expect(enqueue).toHaveBeenCalledWith({
      where: { key },
      create: { organizationId: "org-1", key },
      update: {},
      select: { id: true },
    });
    expect(storage.delete).toHaveBeenCalledOnce();
    expect(db.storedFileDeletion.deleteMany).not.toHaveBeenCalled();
  });

  it("logs when failed upload cleanup cannot be queued or completed directly", async () => {
    const db = makeTenantDb();
    db.storedFile.create.mockRejectedValue(new Error("db down"));
    storage.delete.mockRejectedValue(new Error("storage down"));
    db.storedFileDeletion.upsert.mockRejectedValue(new Error("db still down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(saveImageFile({ ...input, db: db as never })).rejects.toThrow("db down");
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("file.upload_cleanup_failed"),
    );
  });

  it("only reads files that belong to the organization", async () => {
    const find = vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue(null);
    expect(await readStoredFile(prisma as never, "f-1", "org-2")).toBeNull();
    expect(find).toHaveBeenCalledWith({ where: { id: "f-1", organizationId: "org-2" } });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("returns null when the object is missing from storage", async () => {
    vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue({ id: "f-1", key: "k" } as never);
    storage.get.mockResolvedValue(null);
    expect(await readStoredFile(prisma as never, "f-1", "org-1")).toBeNull();
  });

  it("leases deletion jobs and schedules bounded exponential retries", async () => {
    const now = new Date("2026-10-29T20:00:00.000Z");
    vi.spyOn(prisma.storedFileDeletion, "findFirst").mockResolvedValue({
      id: "delete-1",
      organizationId: "org-1",
      key: "org-1/image.png",
      attempts: 0,
    } as never);
    const update = vi.spyOn(prisma.storedFileDeletion, "updateMany").mockResolvedValue({
      count: 1,
    } as never);
    const fileDelete = vi.spyOn(prisma.storedFile, "deleteMany");
    const queueDelete = vi.spyOn(prisma.storedFileDeletion, "deleteMany");
    vi.spyOn(console, "error").mockImplementation(() => {});
    storage.delete.mockRejectedValue(new Error("storage unavailable"));

    await expect(processStoredFileDeletion(prisma as never, "delete-1", now)).resolves.toBe(
      "retry_scheduled",
    );

    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: "delete-1", nextAttemptAt: { lte: now } },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1_000),
      },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: {
        id: "delete-1",
        nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1_000),
      },
      data: { nextAttemptAt: new Date(now.getTime() + 60 * 1_000) },
    });
    expect(fileDelete).not.toHaveBeenCalled();
    expect(queueDelete).not.toHaveBeenCalled();
  });

  it("does not delete an object when another worker has claimed its job", async () => {
    vi.spyOn(prisma.storedFileDeletion, "findFirst").mockResolvedValue({
      id: "delete-1",
      organizationId: "org-1",
      key: "org-1/image.png",
      attempts: 0,
    } as never);
    vi.spyOn(prisma.storedFileDeletion, "updateMany").mockResolvedValue({ count: 0 } as never);

    await expect(processStoredFileDeletion(prisma as never, "delete-1")).resolves.toBe(
      "not_due",
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("durably queues deletion before removing metadata and retries failed objects", async () => {
    const db = makeTenantDb();
    db.storedFile.findFirst.mockResolvedValue({ key: "k" });
    const enqueue = db.storedFileDeletion.upsert.mockResolvedValue({
      id: "delete-1",
    });
    const fileDelete = db.storedFile.deleteMany;
    db.storedFileDeletion.findFirst.mockResolvedValue({
      id: "delete-1",
      organizationId: "org-1",
      key: "k",
      attempts: 0,
    });
    db.storedFileDeletion.updateMany.mockResolvedValue({ count: 1 });
    const queueDelete = db.storedFileDeletion.deleteMany;
    vi.spyOn(console, "error").mockImplementation(() => {});
    storage.delete.mockRejectedValueOnce(new Error("s3 down")).mockResolvedValueOnce(undefined);

    await expect(deleteStoredFile(db as never, "f-1", "org-1")).resolves.toBeUndefined();
    expect(enqueue).toHaveBeenCalled();
    expect(fileDelete.mock.invocationCallOrder[0]).toBeLessThan(
      storage.delete.mock.invocationCallOrder[0]!,
    );
    expect(queueDelete).not.toHaveBeenCalled();

    await expect(
      processStoredFileDeletion(db as never, "delete-1", new Date(Date.now() + 60_001)),
    ).resolves.toBe("deleted");
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(queueDelete).toHaveBeenCalledWith({ where: { id: "delete-1" } });
    expect(storage.delete.mock.invocationCallOrder[1]).toBeLessThan(
      fileDelete.mock.invocationCallOrder[1]!,
    );
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it("does nothing when deleting an unknown file", async () => {
    const db = makeTenantDb();
    db.storedFile.findFirst.mockResolvedValue(null);
    await deleteStoredFile(db as never, "nope", "org-1");
    expect(db.storedFileDeletion.upsert).not.toHaveBeenCalled();
    expect(db.storedFile.deleteMany).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
