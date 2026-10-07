"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recordAuditEvent } from "@/lib/audit";
import { takeRateLimit } from "@/lib/rate-limit";
import { getTenantContext } from "@/lib/tenant-context";
import { runTenantExport } from "./run-export";

export async function requestTenantExport() {
  const { db, organizationId, userId } = await getTenantContext("manageOrganization");

  const active = await db.tenantExport.findFirst({
    where: { organizationId, status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true },
  });
  if (active) return { id: active.id };

  const limit = await takeRateLimit("export", organizationId, { limit: 3, windowSeconds: 3600 });
  if (!limit.allowed) throw new Error("Too many export requests; try again later");

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
