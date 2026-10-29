import { saveImageFile, FileValidationError, MAX_FILE_BYTES } from "@/features/files/server/files";
import { logEvent } from "@/lib/logger";
import { takeRateLimit } from "@/lib/rate-limit";
import { getTenantContext } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_REQUEST_BYTES = MAX_FILE_BYTES + 64 * 1024;

async function parseBoundedFormData(request: Request) {
  if (!request.body) {
    try {
      return { form: await request.formData() } as const;
    } catch {
      return { error: "invalid" } as const;
    }
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPLOAD_REQUEST_BYTES) {
        await reader.cancel();
        return { error: "too_large" } as const;
      }
      chunks.push(value);
    }
  } catch {
    return { error: "invalid" } as const;
  } finally {
    reader.releaseLock();
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    return { error: "invalid" } as const;
  }

  try {
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total),
    });
    return { form: await boundedRequest.formData() } as const;
  } catch {
    return { error: "invalid" } as const;
  }
}

export async function POST(request: Request) {
  let tenant;
  try {
    tenant = await getTenantContext("manageMaintenance");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const limit = await takeRateLimit("upload", tenant.userId, { limit: 30, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason === "unavailable" ? "temporarily_unavailable" : "rate_limited" },
      { status: limit.reason === "unavailable" ? 503 : 429 },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_REQUEST_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const parsed = await parseBoundedFormData(request);
  if (parsed.error === "too_large") {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (parsed.error) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const file = parsed.form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const stored = await saveImageFile({
      db: tenant.db,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ id: stored.id }, { status: 201 });
  } catch (error) {
    if (error instanceof FileValidationError) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    logEvent("error", "file.upload_failed", { error });
    return NextResponse.json({ error: "storage" }, { status: 500 });
  }
}
