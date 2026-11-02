import { beforeEach, describe, expect, it, vi } from "vitest";

const createStorage = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/storage", () => ({
  createStorageFromEnv: createStorage,
}));

import { createExportCleanupStorage } from "./export-object-cleanup";

describe("createExportCleanupStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a separate bucket-scoped cleanup credential for S3", () => {
    const storage = {};
    createStorage.mockReturnValue(storage);
    const env = {
      S3_BUCKET: "maintenance-data",
      S3_ACCESS_KEY_ID: "application-key",
      S3_SECRET_ACCESS_KEY: "application-secret",
      S3_CLEANUP_ACCESS_KEY_ID: "cleanup-key",
      S3_CLEANUP_SECRET_ACCESS_KEY: "cleanup-secret",
    };

    expect(createExportCleanupStorage(env)).toBe(storage);
    expect(createStorage).toHaveBeenCalledWith({
      ...env,
      S3_ACCESS_KEY_ID: "cleanup-key",
      S3_SECRET_ACCESS_KEY: "cleanup-secret",
    });
  });

  it("refuses to fall back to application credentials for S3 object listing", () => {
    expect(() =>
      createExportCleanupStorage({
        S3_BUCKET: "maintenance-data",
        S3_ACCESS_KEY_ID: "application-key",
        S3_SECRET_ACCESS_KEY: "application-secret",
      }),
    ).toThrow(/S3_CLEANUP_ACCESS_KEY_ID/);
    expect(createStorage).not.toHaveBeenCalled();
  });
});
