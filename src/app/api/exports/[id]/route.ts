import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { getStorage } from "@/lib/storage";
import {
  AuthenticationRequiredError,
  getTenantContext,
  OrganizationRequiredError,
  PermissionDeniedError,
  SiteSelectionRequiredError,
  SiteSetupRequiredError,
  TenantInactiveError,
} from "@/lib/tenant-context";
import { MAX_EXPORT_ARCHIVE_BYTES } from "@/features/export/export-policy";

export const dynamic = "force-dynamic";

function verifyArchiveStream(
  source: Readable,
  expectedBytes: number | null,
) {
  const output = new PassThrough({ highWaterMark: 64 * 1024 });
  let bytesRead = 0;
  const verifySize = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesRead += chunk.byteLength;
      if (
        bytesRead > MAX_EXPORT_ARCHIVE_BYTES ||
        (expectedBytes !== null && bytesRead > expectedBytes)
      ) {
        callback(new Error("Stored export exceeds its expected archive size"));
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      if (expectedBytes !== null && bytesRead !== expectedBytes) {
        callback(new Error("Stored export size does not match its metadata"));
        return;
      }
      callback();
    },
  });
  void pipeline(source, verifySize, output).catch((error: unknown) => {
    output.destroy(error instanceof Error ? error : new Error("Export download failed"));
  });
  return output;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let tenant;
  try {
    tenant = await getTenantContext("manageOrganization");
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (error instanceof SiteSelectionRequiredError) {
      return NextResponse.json({ error: "site_required" }, { status: 409 });
    }
    if (
      error instanceof OrganizationRequiredError ||
      error instanceof SiteSetupRequiredError ||
      error instanceof PermissionDeniedError ||
      error instanceof TenantInactiveError
    ) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
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
  const object = record?.fileKey
    ? await getStorage().getStream(record.fileKey, request.signal)
    : null;
  if (!record || !object) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    record.size !== null &&
    object.contentLength !== null &&
    record.size !== object.contentLength
  ) {
    object.body.destroy();
    return NextResponse.json({ error: "storage_integrity_error" }, { status: 502 });
  }
  const contentLength = object.contentLength ?? record.size;
  if (
    contentLength !== null &&
    (!Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > MAX_EXPORT_ARCHIVE_BYTES)
  ) {
    object.body.destroy();
    return NextResponse.json({ error: "storage_integrity_error" }, { status: 502 });
  }

  await recordAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    action: "export.downloaded",
    subjectType: "export",
    subjectId: record.id,
  });
  const headers = new Headers({
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="export-${record.id}.zip"`,
    "Cache-Control": "private, no-store",
  });
  if (contentLength !== null) headers.set("Content-Length", String(contentLength));

  const responseBody = Readable.toWeb(
    verifyArchiveStream(object.body, contentLength),
  ) as unknown as globalThis.ReadableStream<Uint8Array>;
  return new NextResponse(responseBody, {
      headers,
  });
}
