/** Browser-side helpers shared by the image fields (equipment photo, organization logo). */

/** Largest image the browser will try to read before downscaling it. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";
const acceptedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export type ImageFileValidationError = "empty" | "tooLarge" | "unsupported";

export function getImageFileValidationError(
  file: File,
): ImageFileValidationError | null {
  if (file.size === 0) return "empty";
  if (file.size > MAX_SOURCE_BYTES) return "tooLarge";
  if (!acceptedImageTypes.has(file.type)) return "unsupported";
  return null;
}

export function isAcceptableImage(file: File) {
  return getImageFileValidationError(file) === null;
}

/** Scales the image down so its longest edge is at most `maxEdge`, re-encoded as `type`. */
export async function resizeImage(
  file: File,
  { maxEdge, type }: { maxEdge: number; type: "image/jpeg" | "image/png" },
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas context unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("encode"))),
        type,
        type === "image/jpeg" ? 0.85 : undefined,
      ),
    );
  } finally {
    bitmap.close();
  }
}

export type ImageUploadErrorKey =
  | "invalid"
  | "too_large"
  | "forbidden"
  | "rate_limited"
  | "temporarily_unavailable"
  | "storage"
  | "network"
  | "invalid_response"
  | "aborted";

export class ImageUploadError extends Error {
  constructor(readonly code: ImageUploadErrorKey) {
    super(`Image upload failed: ${code}`);
    this.name = "ImageUploadError";
  }
}

export type ImageUploadProgress = (percent: number | null) => void;

function isServerUploadError(
  value: string,
): value is Exclude<
  ImageUploadErrorKey,
  "network" | "invalid_response" | "aborted"
> {
  return (
    value === "invalid" ||
    value === "too_large" ||
    value === "forbidden" ||
    value === "rate_limited" ||
    value === "temporarily_unavailable" ||
    value === "storage"
  );
}

/** Uploads to the tenant-scoped file endpoint and reports actual request-byte progress. */
export function uploadImage(
  blob: Blob,
  filename: string,
  onProgress?: ImageUploadProgress,
): Promise<string> {
  const body = new FormData();
  body.append("file", blob, filename);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      } else {
        onProgress?.(null);
      }
    });
    request.addEventListener("load", () => {
      let payload: unknown;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject(new ImageUploadError("invalid_response"));
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        const errorValue =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : null;
        const code = errorValue && isServerUploadError(errorValue)
          ? errorValue
          : "network";
        reject(new ImageUploadError(code));
        return;
      }

      if (
        typeof payload !== "object" ||
        payload === null ||
        !("id" in payload) ||
        typeof payload.id !== "string" ||
        payload.id.length === 0
      ) {
        reject(new ImageUploadError("invalid_response"));
        return;
      }
      resolve(payload.id);
    });
    request.addEventListener("error", () => reject(new ImageUploadError("network")));
    request.addEventListener("abort", () => reject(new ImageUploadError("aborted")));
    request.send(body);
  });
}

export function getImageUploadErrorKey(error: unknown): ImageUploadErrorKey {
  return error instanceof ImageUploadError ? error.code : "network";
}
