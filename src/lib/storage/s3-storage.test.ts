import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  ListObjectsV2Command: class {
    constructor(readonly input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  S3Client: class {
    send = mocks.send;
    constructor(config: unknown) {
      void config;
    }
  },
}));

import { S3Storage } from "./s3-storage";
import { StorageProviderError } from "./types";

describe("S3Storage.list", () => {
  beforeEach(() => {
    mocks.send.mockReset();
  });

  it("returns an incrementally readable S3 body and content length", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from("first"));
        controller.enqueue(Buffer.from("second"));
        controller.close();
      },
    });
    mocks.send.mockResolvedValueOnce({
      Body: { transformToWebStream: () => body },
      ContentType: "application/zip",
      ContentLength: 11,
    });
    const storage = new S3Storage({
      bucket: "files",
      region: "eu-west-1",
      accessKeyId: "stream-key",
      secretAccessKey: "stream-secret",
      forcePathStyle: true,
    });

    const object = await storage.getStream("exports/org/export.zip");
    const chunks: Buffer[] = [];
    for await (const chunk of object!.body) chunks.push(Buffer.from(chunk));

    expect(Buffer.concat(chunks).toString()).toBe("firstsecond");
    expect(object).toMatchObject({
      contentLength: 11,
      contentType: "application/zip",
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { Bucket: "files", Key: "exports/org/export.zip" },
      }),
      { abortSignal: undefined },
    );
  });

  it("classifies only confirmed missing S3 keys as absent", async () => {
    mocks.send
      .mockRejectedValueOnce(Object.assign(new Error("missing"), { name: "NoSuchKey" }))
      .mockRejectedValueOnce(
        Object.assign(new Error("denied"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 403 },
        }),
      );
    const storage = new S3Storage({
      bucket: "files",
      region: "eu-west-1",
      accessKeyId: "stream-key",
      secretAccessKey: "stream-secret",
      forcePathStyle: true,
    });

    await expect(storage.getStream("missing")).resolves.toBeNull();
    await expect(storage.getStream("denied")).rejects.toBeInstanceOf(
      StorageProviderError,
    );
  });

  it("fails closed on malformed S3 object responses", async () => {
    mocks.send.mockResolvedValueOnce({ ContentLength: -1 });
    const storage = new S3Storage({
      bucket: "files",
      region: "eu-west-1",
      accessKeyId: "stream-key",
      secretAccessKey: "stream-secret",
      forcePathStyle: true,
    });

    await expect(storage.getStream("malformed")).rejects.toBeInstanceOf(
      StorageProviderError,
    );
  });

  describe("S3Storage.putStream", () => {
    beforeEach(() => {
      mocks.send.mockReset();
    });

    it("streams a known-length body with the supplied content type", async () => {
      mocks.send.mockResolvedValueOnce({});
      const storage = new S3Storage({
        bucket: "files",
        region: "eu-west-1",
        accessKeyId: "stream-key",
        secretAccessKey: "stream-secret",
        forcePathStyle: true,
      });
      const body = Readable.from([Buffer.from("archive")]);

      await storage.putStream("exports/org/export.zip", body, "application/zip", 7);

      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: "files",
            Key: "exports/org/export.zip",
            Body: body,
            ContentLength: 7,
            ContentType: "application/zip",
          },
        }),
        { abortSignal: undefined },
      );
    });

    it("destroys the source stream when S3 upload fails", async () => {
      mocks.send.mockRejectedValueOnce(new Error("upload failed"));
      const storage = new S3Storage({
        bucket: "files",
        region: "eu-west-1",
        accessKeyId: "stream-key",
        secretAccessKey: "stream-secret",
        forcePathStyle: true,
      });
      const body = Readable.from([Buffer.from("archive")]);
      const destroy = vi.spyOn(body, "destroy");

      await expect(
        storage.putStream("exports/org/export.zip", body, "application/zip", 7),
      ).rejects.toThrow("upload failed");
      expect(destroy).toHaveBeenCalled();
    });
  });

  it("follows continuation tokens and yields object metadata", async () => {
    const firstModified = new Date("2026-10-28T00:00:00.000Z");
    const secondModified = new Date("2026-10-29T00:00:00.000Z");
    mocks.send
      .mockResolvedValueOnce({
        Contents: [{ Key: "org/a.png", Size: 10, LastModified: firstModified }],
        IsTruncated: true,
        NextContinuationToken: "page-2",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "org/b.png", Size: 20, LastModified: secondModified }],
        IsTruncated: false,
      });

    const storage = new S3Storage({
      bucket: "files",
      region: "eu-west-1",
      accessKeyId: "read-only-key",
      secretAccessKey: "read-only-secret",
      forcePathStyle: true,
    });
    const listed = [];
    for await (const object of storage.list()) listed.push(object);

    expect(listed).toEqual([
      { key: "org/a.png", size: 10, lastModified: firstModified },
      { key: "org/b.png", size: 20, lastModified: secondModified },
    ]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][0].input).toMatchObject({
      Bucket: "files",
      ContinuationToken: undefined,
    });
    expect(mocks.send.mock.calls[1][0].input).toMatchObject({
      Bucket: "files",
      ContinuationToken: "page-2",
    });
  });

  it("limits cleanup listings to the requested export prefix", async () => {
    mocks.send.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
    const storage = new S3Storage({
      bucket: "files",
      region: "eu-west-1",
      accessKeyId: "cleanup-key",
      secretAccessKey: "cleanup-secret",
      forcePathStyle: true,
    });

    for await (const object of storage.list("exports/")) {
      void object;
    }

    expect(mocks.send.mock.calls[0][0].input).toMatchObject({
      Bucket: "files",
      Prefix: "exports/",
    });
  });

  it("fails explicitly if a truncated response cannot continue", async () => {
    mocks.send.mockResolvedValueOnce({ IsTruncated: true });
    const storage = new S3Storage({
      bucket: "files",
      region: "eu-west-1",
      accessKeyId: "read-only-key",
      secretAccessKey: "read-only-secret",
      forcePathStyle: true,
    });

    const listedKeys: string[] = [];
    await expect(async () => {
      for await (const _object of storage.list()) {
        listedKeys.push(_object.key);
      }
    }).rejects.toThrow("without a continuation token");
    expect(listedKeys).toEqual([]);
  });

  it("fails explicitly if the provider repeats a continuation token", async () => {
    mocks.send
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextContinuationToken: "same-token",
      })
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextContinuationToken: "same-token",
      });
    const storage = new S3Storage({
      bucket: "files",
      region: "eu-west-1",
      accessKeyId: "read-only-key",
      secretAccessKey: "read-only-secret",
      forcePathStyle: true,
    });

    await expect(async () => {
      for await (const _object of storage.list()) {
        void _object;
      }
    }).rejects.toThrow("repeated a continuation token");
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});
