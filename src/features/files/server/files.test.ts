import { beforeEach, describe, expect, it, vi } from "vitest";
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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const input = { organizationId: "org-1", userId: "u-1", filename: "pump.png", bytes: PNG };

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
    expect(key).toMatch(/^org-1\/[0-9a-f-]+\.png$/);
    expect(storage.put).toHaveBeenCalledWith(key, PNG, "image/png");
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        uploadedById: "u-1",
        key,
        contentType: "image/png",
        size: PNG.length,
        filename: ".._we ird_name_.png",
      }),
    });
  });

  it("removes the uploaded object when the metadata write fails", async () => {
    vi.spyOn(prisma.storedFile, "create").mockRejectedValue(new Error("db down"));
    await expect(saveImageFile(input)).rejects.toThrow("db down");
    expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
  });

  it("only reads files that belong to the organization", async () => {
    const find = vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue(null);
    expect(await readStoredFile("f-1", "org-2")).toBeNull();
    expect(find).toHaveBeenCalledWith({ where: { id: "f-1", organizationId: "org-2" } });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("returns null when the object is missing from storage", async () => {
    vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue({ id: "f-1", key: "k" } as never);
    storage.get.mockResolvedValue(null);
    expect(await readStoredFile("f-1", "org-1")).toBeNull();
  });

  it("deletes metadata and object, and tolerates storage failures", async () => {
    vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue({ id: "f-1", key: "k" } as never);
    const del = vi.spyOn(prisma.storedFile, "delete").mockResolvedValue({} as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    storage.delete.mockRejectedValue(new Error("s3 down"));

    await expect(deleteStoredFile("f-1", "org-1")).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith({ where: { id: "f-1" } });
    expect(storage.delete).toHaveBeenCalledWith("k");
  });

  it("does nothing when deleting an unknown file", async () => {
    vi.spyOn(prisma.storedFile, "findFirst").mockResolvedValue(null);
    const del = vi.spyOn(prisma.storedFile, "delete");
    await deleteStoredFile("nope", "org-1");
    expect(del).not.toHaveBeenCalled();
  });
});
