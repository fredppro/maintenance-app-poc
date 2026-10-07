import { saveImageFile, FileValidationError, MAX_FILE_BYTES } from "@/features/files/server/files";
import { getTenantContext } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let tenant;
  try {
    tenant = await getTenantContext("manageMaintenance");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const stored = await saveImageFile({
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
    console.error("File upload failed", error);
    return NextResponse.json({ error: "storage" }, { status: 500 });
  }
}
