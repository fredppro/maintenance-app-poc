import { readStoredFile } from "@/features/files/server/files";
import type { TenantDb } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let organizationId: string;
  let db: TenantDb;
  try {
    ({ organizationId, db } = await getTenantContext("viewMaintenance"));
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await readStoredFile(db, id, organizationId);
  if (!result) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.object.body), {
    headers: {
      "Content-Type": result.file.contentType,
      "Content-Length": String(result.file.size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      // File ids are immutable, so browsers may keep them privately.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
