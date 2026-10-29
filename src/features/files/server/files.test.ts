import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import prisma from "@/lib/prisma";
import {
  deleteStoredFile,
  FileValidationError,
  MAX_FILE_BYTES,
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

  it("removes the uploaded object when the metadata write fails", async () => {
    vi.spyOn(prisma.storedFile, "create").mockRejectedValue(new Error("db down"));
    await expect(saveImageFile(input)).rejects.toThrow("db down");
    expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
  });

  it("logs when a failed metadata write also prevents object cleanup", async () => {
    vi.spyOn(prisma.storedFile, "create").mockRejectedValue(new Error("db down"));
    storage.delete.mockRejectedValue(new Error("storage down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(saveImageFile(input)).rejects.toThrow("db down");
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

  it("deletes metadata and object, and tolerates storage failures", async () => {
    vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue({ id: "f-1", key: "k" } as never);
    const del = vi.spyOn(prisma.storedFile, "delete").mockResolvedValue({} as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    storage.delete.mockRejectedValue(new Error("s3 down"));

    await expect(deleteStoredFile(prisma as never, "f-1", "org-1")).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith({ where: { id: "f-1" } });
    expect(storage.delete).toHaveBeenCalledWith("k");
  });

  it("does nothing when deleting an unknown file", async () => {
    vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue(null);
    const del = vi.spyOn(prisma.storedFile, "delete");
    await deleteStoredFile(prisma as never, "nope", "org-1");
    expect(del).not.toHaveBeenCalled();
  });
});
