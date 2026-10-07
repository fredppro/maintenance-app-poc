import { randomUUID } from "node:crypto";
import type { TenantDb } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/webp": { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] },
} as const;

export type AllowedImageType = keyof typeof IMAGE_TYPES;

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

/** Trust the file's bytes rather than the client-declared MIME type. */
export function detectImageType(bytes: Buffer): AllowedImageType | null {
  for (const [type, { magic }] of Object.entries(IMAGE_TYPES)) {
    if (magic.every((byte, i) => bytes[i] === byte)) {
      if (type === "image/webp" && bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
        continue;
      }
      return type as AllowedImageType;
    }
  }
  return null;
}

function safeFilename(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

export async function saveImageFile(input: {
  db: TenantDb;
  organizationId: string;
  userId: string;
  filename: string;
  bytes: Buffer;
}) {
  if (input.bytes.length === 0 || input.bytes.length > MAX_FILE_BYTES) {
    throw new FileValidationError("File size is not allowed");
  }
  const contentType = detectImageType(input.bytes);
  if (!contentType) {
    throw new FileValidationError("Unsupported file type");
  }

  const key = `${input.organizationId}/${randomUUID()}.${IMAGE_TYPES[contentType].ext}`;
  const { db } = input;
  const storage = getStorage();
  await storage.put(key, input.bytes, contentType);

  try {
    return await db.storedFile.create({
      data: {
        organizationId: input.organizationId,
        uploadedById: input.userId,
        key,
        filename: safeFilename(input.filename),
        contentType,
        size: input.bytes.length,
      },
    });
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    throw error;
  }
}

export async function readStoredFile(db: TenantDb, id: string, organizationId: string) {
  const file = await db.storedFile.findFirst({
    where: { id, organizationId },
  });
  if (!file) return null;
  const object = await getStorage().get(file.key);
  return object ? { file, object } : null;
}

/** Removes the object and its metadata; storage failures are logged, never thrown. */
export async function deleteStoredFile(db: TenantDb, id: string, organizationId: string) {
  const file = await db.storedFile.findFirst({ where: { id, organizationId } });
  if (!file) return;
  await db.storedFile.delete({ where: { id } });
  try {
    await getStorage().delete(file.key);
  } catch (error) {
    console.error("Failed to delete stored object", file.key, error);
  }
}
