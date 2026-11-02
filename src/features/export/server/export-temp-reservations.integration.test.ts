import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../../../../prisma/generated/prisma/client";

const databaseUrl = process.env.EXPORT_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("export temp reservations in PostgreSQL", () => {
  let admin: PrismaClient;
  const organizationId = `export-reservation-${randomUUID()}`;
  const exportIds = Array.from({ length: 10 }, () => randomUUID());

  const createClient = () =>
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }),
    });

  beforeAll(async () => {
    admin = createClient();
    await admin.$executeRawUnsafe(
      `INSERT INTO "organization" ("id", "name", "slug", "createdAt")
       VALUES ($1, 'Export reservation test', $2, NOW())`,
      organizationId,
      organizationId,
    );
    for (const id of exportIds) {
      await admin.$executeRawUnsafe(
        `INSERT INTO "tenant_export" ("id", "organizationId", "requestedById")
         VALUES ($1, $2, 'integration-test')`,
        id,
        organizationId,
      );
    }
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.$executeRawUnsafe(
      `DELETE FROM "tenant_export_temp_reservation" WHERE "organizationId" = $1`,
      organizationId,
    );
    await admin.$executeRawUnsafe(
      `DELETE FROM "tenant_export" WHERE "organizationId" = $1`,
      organizationId,
    );
    await admin.$executeRawUnsafe(
      `DELETE FROM "organization" WHERE "id" = $1`,
      organizationId,
    );
    await admin.$disconnect();
  });

  async function callAsTenant<T>(
    statement: string,
    parameters: unknown[],
  ): Promise<T[]> {
    const client = createClient();
    try {
      return await client.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(
          "SELECT set_config('app.org_id', $1, true)",
          organizationId,
        );
        return tx.$queryRawUnsafe<T[]>(statement, ...parameters);
      });
    } finally {
      await client.$disconnect();
    }
  }

  it("admits no more than four simultaneous workers across database connections", async () => {
    const results = await Promise.all(
      exportIds.slice(0, 8).map((exportId) => {
        const leaseId = randomUUID();
        return callAsTenant<{ reservation_id: string }>(
          `SELECT reservation_id
           FROM public.reserve_tenant_export_temp($1, $2, $3)`,
          [organizationId, exportId, leaseId],
        );
      }),
    );
    expect(results.flat()).toHaveLength(4);
    const [reservationCount] = await admin.$queryRawUnsafe<
      { count: number }[]
    >(
      `SELECT count(*)::int AS count
       FROM "tenant_export_temp_reservation" WHERE "organizationId" = $1`,
      organizationId,
    );
    expect(reservationCount.count).toBe(4);
  });

  it("releases capacity and fails exports whose leases have expired", async () => {
    const [reservation] = await admin.$queryRawUnsafe<
      { id: string; exportId: string }[]
    >(
      `SELECT "id", "exportId" FROM "tenant_export_temp_reservation"
       WHERE "organizationId" = $1 LIMIT 1`,
      organizationId,
    );
    expect(reservation).toBeTruthy();
    await admin.$executeRawUnsafe(
      `UPDATE "tenant_export_temp_reservation"
       SET "heartbeatAt" = NOW() - INTERVAL '5 minutes' WHERE "id" = $1`,
      reservation.id,
    );

    const newLeaseId = randomUUID();
    const [reclaimed] = await callAsTenant<{ reservation_id: string }>(
      `SELECT reservation_id
       FROM public.reserve_tenant_export_temp($1, $2, $3)`,
      [organizationId, exportIds[8], newLeaseId],
    );
    expect(reclaimed).toBeTruthy();
    const [staleExport] = await admin.$queryRawUnsafe<
      { status: string; error: string | null }[]
    >(
      `SELECT "status"::text AS "status", "error" FROM "tenant_export"
       WHERE "organizationId" = $1 AND "id" = $2`,
      organizationId,
      reservation.exportId,
    );
    expect(staleExport).toEqual({
      status: "FAILED",
      error: "WORKER_LEASE_EXPIRED",
    });
    const [released] = await callAsTenant<{ released: boolean }>(
      `SELECT public.release_tenant_export_temp($1, $2, $3) AS released`,
      [organizationId, exportIds[8], newLeaseId],
    );
    expect(released.released).toBe(true);
  });
});
