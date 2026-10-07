import type { Worker as PrismaWorker } from "../../../prisma/generated/prisma/client";

export type Worker = Omit<PrismaWorker, "organizationId" | "deletedAt" | "deletedById">;
