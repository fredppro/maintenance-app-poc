import prisma from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { Prisma } from "../../prisma/generated/prisma/client";

type AuditEvent = {
  organizationId: string;
  actorUserId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  details?: Prisma.InputJsonValue;
};

/**
 * Records a privileged or destructive action. An audit failure is logged but
 * never blocks the action the user already performed.
 */
export async function recordAuditEvent(event: AuditEvent) {
  try {
    await prisma.organizationAuditEvent.create({ data: event });
  } catch (error) {
    logEvent("error", "audit.write_failed", { action: event.action, error });
  }
}
