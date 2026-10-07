import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { getStorage } from "@/lib/storage";
import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let tenant;
  try {
    tenant = await getTenantContext("manageOrganization");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const record = await tenant.db.tenantExport.findFirst({
    where: {
      id,
      organizationId: tenant.organizationId,
      status: "READY",
      expiresAt: { gt: new Date() },
    },
  });
  const object = record?.fileKey ? await getStorage().get(record.fileKey) : null;
  if (!record || !object) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    action: "export.downloaded",
    subjectType: "export",
    subjectId: record.id,
  });
  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(object.body.length),
      "Content-Disposition": `attachment; filename="export-${record.id}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
