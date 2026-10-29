import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { logEvent } from "@/lib/logger";
import type { TenantDb } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_IMAGE_DIMENSION = 8_192;
const MAX_STORED_IMAGE_DIMENSION = 4_096;

const IMAGE_TYPES = {
  "image/png": { ext: "png", format: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: "jpg", format: "jpeg", magic: [0xff, 0xd8, 0xff] },
  "image/webp": { ext: "webp", format: "webp", magic: [0x52, 0x49, 0x46, 0x46] },
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

async function normalizeImage(bytes: Buffer, contentType: AllowedImageType) {
  const imageType = IMAGE_TYPES[contentType];

  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: MAX_IMAGE_PIXELS,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== imageType.format ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_DIMENSION ||
      metadata.height > MAX_IMAGE_DIMENSION ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new FileValidationError("Image dimensions or encoding are not allowed");
    }

    const output = image
      .rotate()
      .resize({
        width: MAX_STORED_IMAGE_DIMENSION,
        height: MAX_STORED_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });

    if (contentType === "image/png") {
      output.png({ compressionLevel: 9 });
    } else if (contentType === "image/jpeg") {
      output.jpeg({ quality: 85, mozjpeg: true });
    } else {
      output.webp({ quality: 85 });
    }

    const { data, info } = await output.toBuffer({ resolveWithObject: true });
    if (info.format !== imageType.format || data.length === 0 || data.length > MAX_FILE_BYTES) {
      throw new FileValidationError("Normalized image size is not allowed");
    }
    return data;
  } catch (error) {
    if (error instanceof FileValidationError) throw error;
    logEvent("warn", "file.image_decode_failed", { error });
    throw new FileValidationError("Image could not be decoded");
  }
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
  const normalizedBytes = await normalizeImage(input.bytes, contentType);

  const key = `${input.organizationId}/${randomUUID()}.${IMAGE_TYPES[contentType].ext}`;
  const { db } = input;
  const storage = getStorage();
  await storage.put(key, normalizedBytes, contentType);

  try {
    return await db.storedFile.create({
      data: {
        organizationId: input.organizationId,
        uploadedById: input.userId,
        key,
        filename: safeFilename(input.filename),
        contentType,
        size: normalizedBytes.length,
      },
    });
  } catch (error) {
    try {
      await storage.delete(key);
    } catch (cleanupError) {
      logEvent("error", "file.upload_cleanup_failed", { error: cleanupError });
    }
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
    logEvent("error", "file.object_delete_failed", { fileId: id, error });
  }
}
