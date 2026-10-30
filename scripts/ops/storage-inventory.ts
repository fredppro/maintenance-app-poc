// Read-only inventory of old storage objects without database metadata. Run
// with an owner/BYPASSRLS connection and a separate, read-only S3 listing key:
//   pnpm ops:storage:inventory -- --older-than-hours 48
import "../../prisma/seed-env";
import { pathToFileURL } from "node:url";
import { createStorageFromEnv } from "../../src/lib/storage";
import type { ObjectStorage, StoredObjectInfo } from "../../src/lib/storage";
import prisma from "../../src/lib/prisma";

const HOUR_MS = 60 * 60 * 1000;

export function parseStorageInventoryCutoff(
  args: string[],
  now = new Date(),
): Date {
  if (args.length !== 2 || args[0] !== "--older-than-hours") {
    throw new Error(
      "Usage: pnpm ops:storage:inventory -- --older-than-hours <positive-hours>",
    );
  }
  const hours = Number(args[1]);
  const cutoff = new Date(now.getTime() - hours * HOUR_MS);
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(cutoff.getTime())) {
    throw new Error("--older-than-hours must be a positive, finite number");
  }
  return cutoff;
}

function createInventoryStorage(
  env: Record<string, string | undefined>,
): ObjectStorage {
  if (!env.S3_BUCKET) return createStorageFromEnv(env);

  const accessKeyId = env.S3_AUDIT_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_AUDIT_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_AUDIT_ACCESS_KEY_ID and S3_AUDIT_SECRET_ACCESS_KEY are required for an S3 inventory",
    );
  }
  return createStorageFromEnv({
    ...env,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  });
}

export function findStorageOrphans(
  objects: StoredObjectInfo[],
  referencedKeys: Set<string>,
  olderThan: Date,
) {
  return objects.filter(
    (object) =>
      object.lastModified !== null &&
      Number.isFinite(object.lastModified.getTime()) &&
      object.lastModified <= olderThan &&
      !referencedKeys.has(object.key),
  );
}

export async function runStorageInventory(
  olderThan: Date,
  env: Record<string, string | undefined> = process.env,
) {
  if (!env.MIGRATION_DATABASE_URL?.trim()) {
    throw new Error("MIGRATION_DATABASE_URL is required for a complete inventory");
  }
  if (!Number.isFinite(olderThan.getTime())) {
    throw new Error("Inventory cutoff must be a valid date");
  }

  const storage = createInventoryStorage(env);
  const [role] = await prisma.$queryRaw<
    { rolsuper: boolean; rolbypassrls: boolean }[]
  >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  if (!role || (!role.rolsuper && !role.rolbypassrls)) {
    throw new Error(
      "Database role cannot bypass row-level security; refusing an incomplete inventory",
    );
  }

  const [files, exports, deletions] = await Promise.all([
    prisma.storedFile.findMany({ select: { key: true } }),
    prisma.tenantExport.findMany({
      where: { fileKey: { not: null } },
      select: { fileKey: true },
    }),
    prisma.storedFileDeletion.findMany({ select: { key: true } }),
  ]);
  const referencedKeys = new Set([
    ...files.map(({ key }) => key),
    ...exports.flatMap(({ fileKey }) => (fileKey ? [fileKey] : [])),
    ...deletions.map(({ key }) => key),
  ]);

  const candidates: StoredObjectInfo[] = [];
  let objectsListed = 0;
  let totalBytes = 0;
  let objectsWithoutSize = 0;
  let objectsWithoutTimestamp = 0;
  let candidateBytes = 0;
  for await (const object of storage.list()) {
    objectsListed += 1;
    if (object.size === null) objectsWithoutSize += 1;
    else totalBytes += object.size;
    if (
      object.lastModified === null ||
      !Number.isFinite(object.lastModified.getTime())
    ) {
      objectsWithoutTimestamp += 1;
    }
    if (
      object.lastModified !== null &&
      Number.isFinite(object.lastModified.getTime()) &&
      object.lastModified <= olderThan &&
      !referencedKeys.has(object.key)
    ) {
      candidates.push(object);
      candidateBytes += object.size ?? 0;
    }
  }

  return {
    olderThan,
    objectsListed,
    referencedKeys: referencedKeys.size,
    totalBytes,
    objectsWithoutSize,
    objectsWithoutTimestamp,
    candidateCount: candidates.length,
    candidateBytes,
    candidates,
  };
}

async function main() {
  const olderThan = parseStorageInventoryCutoff(process.argv.slice(2));
  const result = await runStorageInventory(olderThan);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(
        "storage inventory failed:",
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
