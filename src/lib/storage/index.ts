import path from "node:path";
import { LocalStorage } from "./local-storage";
import { S3Storage } from "./s3-storage";
import type { ObjectStorage } from "./types";

export type { ObjectStorage, StoredObject } from "./types";

let instance: ObjectStorage | undefined;

/**
 * Builds the storage backend from the environment.
 * - `S3_BUCKET` set → S3-compatible (AWS S3, MinIO, R2…). Set `S3_ENDPOINT` for MinIO.
 * - otherwise → local disk under `STORAGE_LOCAL_DIR` (development only).
 */
export function createStorageFromEnv(env: Record<string, string | undefined>): ObjectStorage {
  if (env.S3_BUCKET) {
    const accessKeyId = env.S3_ACCESS_KEY_ID;
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required");
    }
    return new S3Storage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION ?? "us-east-1",
      endpoint: env.S3_ENDPOINT || undefined,
      // MinIO needs path-style addressing; AWS S3 does not.
      forcePathStyle: env.S3_FORCE_PATH_STYLE
        ? env.S3_FORCE_PATH_STYLE === "true"
        : Boolean(env.S3_ENDPOINT),
      accessKeyId,
      secretAccessKey,
    });
  }

  if (env.NODE_ENV === "production") {
    throw new Error("S3_BUCKET must be configured for file storage in production");
  }
  return new LocalStorage(
    path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR ?? ".storage"),
  );
}

export function getStorage(): ObjectStorage {
  instance ??= createStorageFromEnv(process.env);
  return instance;
}

/** Test seam. */
export function setStorageForTests(storage: ObjectStorage | undefined) {
  instance = storage;
}
