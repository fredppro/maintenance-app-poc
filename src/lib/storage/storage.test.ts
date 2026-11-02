import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
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
    await storage.put("org/nested/b.zip", Buffer.from("export"), "application/zip");
    await storage.put("exports/org/export/lease.zip", Buffer.from("attempt"), "application/zip");
    await storage.putStream(
      "exports/org/export/streamed.zip",
      Readable.from([Buffer.from("streamed")]),
      "application/zip",
      8,
    );
    const object = await storage.get("org/a.png");
    expect(object?.body.toString()).toBe("abc");
    expect(object?.contentType).toBe("image/png");
    const streamed = await storage.getStream("org/nested/b.zip");
    expect(streamed?.contentLength).toBe(6);
    const chunks: Buffer[] = [];
    for await (const chunk of streamed!.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe("export");
    const listed = [];
    for await (const item of storage.list()) listed.push(item);
    expect(listed.map(({ key }) => key).sort()).toEqual([
      "exports/org/export/lease.zip",
      "exports/org/export/streamed.zip",
      "org/a.png",
      "org/nested/b.zip",
    ]);
    expect(listed.find(({ key }) => key === "org/a.png")).toMatchObject({
      size: 3,
      lastModified: expect.any(Date),
    });
    const exportObjects = [];
    for await (const item of storage.list("exports/")) exportObjects.push(item.key);
    expect(exportObjects).toEqual([
      "exports/org/export/lease.zip",
      "exports/org/export/streamed.zip",
    ]);
    await storage.delete("org/a.png");
    expect(await storage.get("org/a.png")).toBeNull();
    expect(await storage.getStream("org/a.png")).toBeNull();
  });

  it("rejects keys that escape the root", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "storage-"));
    await expect(
      new LocalStorage(dir).put("../evil", Buffer.from("x"), "text/plain"),
    ).rejects.toThrow("Invalid storage key");
  });

  it("removes a partial streamed object when the declared size is incorrect", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "storage-"));
    const storage = new LocalStorage(dir);

    await expect(
      storage.putStream(
        "org/partial.zip",
        Readable.from([Buffer.from("short")]),
        "application/zip",
        100,
      ),
    ).rejects.toThrow("did not match its declared content length");
    expect(await storage.get("org/partial.zip")).toBeNull();
  });

  it("removes temporary data when the input stream fails", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "storage-"));
    const storage = new LocalStorage(dir);
    const body = Readable.from(
      (async function* () {
        yield Buffer.from("partial");
        throw new Error("source stream failed");
      })(),
    );

    await expect(
      storage.putStream("org/failed.zip", body, "application/zip", 100),
    ).rejects.toThrow("source stream failed");
    expect(await storage.get("org/failed.zip")).toBeNull();
  });

  it("preserves an existing object when a replacement stream fails before publish", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "storage-"));
    const storage = new LocalStorage(dir);
    await storage.put("org/retry.zip", Buffer.from("previous"), "application/zip");
    const body = Readable.from(
      (async function* () {
        yield Buffer.from("partial");
        throw new Error("replacement interrupted");
      })(),
    );

    await expect(
      storage.putStream("org/retry.zip", body, "application/zip", 100),
    ).rejects.toThrow("replacement interrupted");
    expect((await storage.get("org/retry.zip"))?.body.toString()).toBe(
      "previous",
    );
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
