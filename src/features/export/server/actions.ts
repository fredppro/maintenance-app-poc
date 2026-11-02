"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { takeRateLimit } from "@/lib/rate-limit";
import { getTenantContext } from "@/lib/tenant-context";
import { isExportRecoverable, STALE_EXPORT_AFTER_MS } from "../export-policy";
import { runTenantExport } from "./run-export";

export async function requestTenantExport() {
  const { db, organizationId, userId } = await getTenantContext("manageOrganization");

  const active = await db.tenantExport.findFirst({
    where: { organizationId, status: { in: ["PENDING", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, heartbeatAt: true },
  });
  if (active) {
    if (isExportRecoverable(active.status, active.heartbeatAt)) {
      if (active.status === "PENDING") {
        after(() => runTenantExport(db, organizationId, active.id));
        return { id: active.id };
      }

      const staleBefore = new Date(Date.now() - STALE_EXPORT_AFTER_MS);
      const heartbeatFilter = active.heartbeatAt
        ? { lte: staleBefore }
        : null;
      const reclaimed = await db.tenantExport.updateMany({
        where: {
          id: active.id,
          organizationId,
          status: "RUNNING",
          heartbeatAt: heartbeatFilter,
        },
        data: {
          status: "PENDING",
          leaseId: null,
          heartbeatAt: null,
          error: null,
        },
      });
      if (reclaimed.count > 0) {
        after(() => runTenantExport(db, organizationId, active.id));
      }
    }
    return { id: active.id };
  }

  const limit = await takeRateLimit("export", organizationId, { limit: 3, windowSeconds: 3600 });
  if (!limit.allowed) {
    throw new Error(
      limit.reason === "unavailable"
        ? "Rate limiting is temporarily unavailable; try again later"
        : "Too many export requests; try again later",
    );
  }

  const created = await db.tenantExport.create({
    data: { organizationId, requestedById: userId },
    select: { id: true },
  });
  await recordAuditEvent({
    organizationId,
    actorUserId: userId,
    action: "export.requested",
    subjectType: "export",
    subjectId: created.id,
  });
  after(() => runTenantExport(db, organizationId, created.id));
  revalidatePath("/organization");
  return created;
}
