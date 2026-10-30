import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("S3Storage.list", () => {
  beforeEach(() => {
    mocks.send.mockReset();
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
