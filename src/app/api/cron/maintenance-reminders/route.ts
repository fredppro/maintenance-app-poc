import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchMaintenanceReminders } from "@/features/scheduler/server/reminders";
import prisma, { forTenant } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hasValidCronAuthorization(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const suppliedBytes = Buffer.from(supplied);
  const secretBytes = Buffer.from(secret);
  return (
    suppliedBytes.length === secretBytes.length &&
    timingSafeEqual(suppliedBytes, secretBytes)
  );
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (!hasValidCronAuthorization(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizations = await prisma.organization.findMany({
    select: { id: true },
  });
  const totals = { cancelled: 0, failed: 0, sent: 0, skipped: 0 };
  let organizationFailures = 0;

  for (const { id } of organizations) {
    try {
      const settings = await forTenant(id).tenantSettings.findUnique({
        where: { organizationId: id },
        select: { status: true, isolationTier: true },
      });
      if (
        settings &&
        (settings.status !== "ACTIVE" || settings.isolationTier !== "POOLED")
      ) {
        continue;
      }
      const result = await dispatchMaintenanceReminders(id);
      totals.cancelled += result.cancelled;
      totals.failed += result.failed;
      totals.sent += result.sent;
      totals.skipped += result.skipped;
    } catch (error) {
      organizationFailures += 1;
      console.error("Maintenance reminder dispatch failed", {
        organizationId: id,
        error,
      });
    }
  }

  return NextResponse.json(
    { ...totals, organizationFailures },
    { status: organizationFailures ? 500 : 200 },
  );
}
