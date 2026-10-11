/** Browser-side helpers shared by the image fields (equipment photo, organization logo). */

/** Largest image the browser will try to read before downscaling it. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";

export function isAcceptableImage(file: File) {
  return file.type.startsWith("image/") && file.size <= MAX_SOURCE_BYTES;
}

/** Scales the image down so its longest edge is at most `maxEdge`, re-encoded as `type`. */
export async function resizeImage(
  file: File,
  { maxEdge, type }: { maxEdge: number; type: "image/jpeg" | "image/png" },
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode"))),
      type,
      type === "image/jpeg" ? 0.85 : undefined,
    ),
  );
}

/** Uploads to the tenant-scoped file endpoint and returns the stored file id. */
export async function uploadImage(blob: Blob, filename: string): Promise<string> {
  const body = new FormData();
  body.append("file", blob, filename);
  const response = await fetch("/api/files", { method: "POST", body });
  if (!response.ok) throw new Error("upload failed");
  return ((await response.json()) as { id: string }).id;
}
