import { createStorageFromEnv } from "../../src/lib/storage";

export function createExportCleanupStorage(
  env: Record<string, string | undefined>,
) {
  if (!env.S3_BUCKET) return createStorageFromEnv(env);

  const accessKeyId = env.S3_CLEANUP_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_CLEANUP_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_CLEANUP_ACCESS_KEY_ID and S3_CLEANUP_SECRET_ACCESS_KEY are required to reconcile export objects",
    );
  }

  return createStorageFromEnv({
    ...env,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  });
}
