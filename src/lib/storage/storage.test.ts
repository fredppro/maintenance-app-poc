import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectImageType } from "@/features/files/server/files";
import { createStorageFromEnv } from "./index";
import { LocalStorage } from "./local-storage";
import { S3Storage } from "./s3-storage";

describe("LocalStorage", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("stores, reads and deletes objects", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "storage-"));
    const storage = new LocalStorage(dir);
    await storage.put("org/a.png", Buffer.from("abc"), "image/png");
    const object = await storage.get("org/a.png");
    expect(object?.body.toString()).toBe("abc");
    expect(object?.contentType).toBe("image/png");
    await storage.delete("org/a.png");
    expect(await storage.get("org/a.png")).toBeNull();
  });

  it("rejects keys that escape the root", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "storage-"));
    await expect(
      new LocalStorage(dir).put("../evil", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow("Invalid storage key");
  });
});

describe("createStorageFromEnv", () => {
  it("selects S3/MinIO when a bucket is configured", () => {
    const storage = createStorageFromEnv({
      S3_BUCKET: "files",
      S3_ENDPOINT: "http://localhost:9000",
      S3_ACCESS_KEY_ID: "id",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(storage).toBeInstanceOf(S3Storage);
  });

  it("requires credentials for S3", () => {
    expect(() =>
      createStorageFromEnv({ S3_BUCKET: "files" }),
    ).toThrow();
  });

  it("falls back to local disk in development and refuses it in production", () => {
    expect(
      createStorageFromEnv({ NODE_ENV: "development" }),
    ).toBeInstanceOf(LocalStorage);
    expect(() =>
      createStorageFromEnv({ NODE_ENV: "production" }),
    ).toThrow();
  });
});

describe("detectImageType", () => {
  it("recognises images by magic bytes", () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]))).toBe("image/png");
    expect(
      detectImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii")),
    ).toBe("image/webp");
  });

  it("rejects other content", () => {
    expect(detectImageType(Buffer.from("<svg></svg>"))).toBeNull();
    expect(detectImageType(Buffer.from("RIFF\0\0\0\0WAVE", "ascii"))).toBeNull();
  });
});
