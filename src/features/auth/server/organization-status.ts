import { APIError } from "better-auth/api";
import prisma from "@/lib/prisma";

export async function requireActiveOrganization(organizationId: string) {
  const settings = await prisma.tenantSettings.findUnique({
    where: { organizationId },
    select: { status: true },
  });

  if ((settings?.status ?? "ACTIVE") !== "ACTIVE") {
    throw new APIError("FORBIDDEN", {
      message: "This organization is not active",
    });
  }
}
