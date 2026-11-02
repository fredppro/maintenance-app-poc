import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against a real database. Set RLS_TEST_DATABASE_URL to a *superuser* URL
// of a disposable, fully migrated database; the test drops to a restricted role
// per transaction so the policies are actually enforced.
const url = process.env.RLS_TEST_DATABASE_URL;
const ROLE = "rls_test_app";

describe.skipIf(!url)("tenant isolation in PostgreSQL", () => {
  let db: import("./prisma").DB;
  const ids = { a: `rls-a-${Date.now()}`, b: `rls-b-${Date.now()}` };

  const asTenant = async <T>(
    org: string | null,
    fn: (tx: import("./prisma").DB) => Promise<T>,
  ): Promise<T> =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE}`);
      if (org) await tx.$executeRaw`SELECT set_config('app.org_id', ${org}, true)`;
      return fn(tx as never);
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ default: db } = await import("./prisma"));
    await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => {});
    await db.$executeRawUnsafe(`CREATE ROLE ${ROLE} NOLOGIN NOBYPASSRLS`);
    await db.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
    for (const [key, id] of Object.entries(ids)) {
      await db.organization.create({
        data: { id, name: key, slug: id, createdAt: new Date() },
      });
      await db.site.create({ data: { id: `${id}-site`, name: "HQ", organizationId: id } });
      await db.storedFile.create({
        data: {
          id: `${id}-file`, organizationId: id, key: `${id}/f.png`,
          filename: "f.png", contentType: "image/png", size: 1,
        },
      });
      await db.storedFileDeletion.create({
        data: {
          id: `${id}-delete`,
          organizationId: id,
          key: `${id}/pending.png`,
        },
      });
      const equipmentId = `${id}-equipment`;
      const pointId = `${id}-point`;
      const taskId = `${id}-task`;
      const workerId = `${id}-worker`;
      await db.equipment.create({
        data: {
          id: equipmentId,
          name: `Equipment ${key}`,
          organizationId: id,
          siteId: `${id}-site`,
        },
      });
      await db.equipmentMaintenancePoint.create({
        data: {
          id: pointId,
          equipmentId,
          organizationId: id,
          name: "Drive belt",
        },
      });
      await db.equipmentPointChecklistItem.create({
        data: {
          id: `${id}-template`,
          pointId,
          equipmentId,
          organizationId: id,
          title: "Inspect belt",
        },
      });
      await db.worker.create({
        data: {
          id: workerId,
          organizationId: id,
          name: "Worker",
          email: `${id}@example.test`,
        },
      });
      await db.maintenanceTask.create({
        data: {
          id: taskId,
          title: "Inspect drive",
          startTime: new Date("2026-06-30T08:00:00.000Z"),
          equipmentId,
          maintenancePointId: pointId,
          organizationId: id,
        },
      });
      await db.maintenanceTaskReminder.create({
        data: {
          id: `${id}-reminder`,
          taskId,
          workerId,
          organizationId: id,
          recipientEmail: `${id}@example.test`,
          scheduledFor: new Date("2026-06-29T08:00:00.000Z"),
          nextAttemptAt: new Date("2026-06-29T08:00:00.000Z"),
        },
      });
      await db.maintenanceTaskDailyHours.create({
        data: {
          id: `${id}-daily-hours`,
          taskId,
          workerId,
          organizationId: id,
          workDate: new Date("2026-06-30T00:00:00.000Z"),
          hours: "2.00",
        },
      });
      await db.maintenanceTaskChecklistItem.create({
        data: {
          id: `${id}-checklist`,
          taskId,
          organizationId: id,
          title: "Inspect belt",
        },
      });
      await db.equipmentOperatingHourReading.create({
        data: {
          id: `${id}-hours-reading`,
          equipmentId,
          organizationId: id,
          reading: "100.00",
        },
      });
      await db.inventoryItem.create({
        data: {
          id: `${id}-inventory-item`,
          name: "Hydraulic oil",
          siteId: `${id}-site`,
          organizationId: id,
          onHand: "10.00",
          reorderPoint: "2.00",
        },
      });
      await db.inventoryMovement.create({
        data: {
          id: `${id}-inventory-movement`,
          inventoryItemId: `${id}-inventory-item`,
          organizationId: id,
          taskId,
          type: "CONSUMPTION",
          quantity: "1.00",
        },
      });
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.storedFileDeletion.deleteMany({
      where: { organizationId: { in: Object.values(ids) } },
    });
    await db.organization.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await db.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`);
    await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`);
  });

  it("only exposes the active tenant's rows", async () => {
    const sites = await asTenant(ids.a, (tx) => tx.site.findMany());
    expect(sites.map((s) => s.id)).toEqual([`${ids.a}-site`]);
  });

  it("isolates maintenance points, checklists, daily hours and operating-hour readings", async () => {
    const result = await asTenant(ids.a, async (tx) => ({
      points: await tx.equipmentMaintenancePoint.findMany(),
      templates: await tx.equipmentPointChecklistItem.findMany(),
      checklist: await tx.maintenanceTaskChecklistItem.findMany(),
      dailyHours: await tx.maintenanceTaskDailyHours.findMany(),
      readings: await tx.equipmentOperatingHourReading.findMany(),
      inventory: await tx.inventoryItem.findMany(),
      movements: await tx.inventoryMovement.findMany(),
      reminders: await tx.maintenanceTaskReminder.findMany(),
    }));
    expect(result.points.map((row) => row.id)).toEqual([`${ids.a}-point`]);
    expect(result.templates.map((row) => row.id)).toEqual([`${ids.a}-template`]);
    expect(result.checklist.map((row) => row.id)).toEqual([`${ids.a}-checklist`]);
    expect(result.dailyHours.map((row) => row.id)).toEqual([`${ids.a}-daily-hours`]);
    expect(result.readings.map((row) => row.id)).toEqual([`${ids.a}-hours-reading`]);
    expect(result.inventory.map((row) => row.id)).toEqual([`${ids.a}-inventory-item`]);
    expect(result.movements.map((row) => row.id)).toEqual([`${ids.a}-inventory-movement`]);
    expect(result.reminders.map((row) => row.id)).toEqual([`${ids.a}-reminder`]);

    const readingMutation = await asTenant(ids.a, async (tx) => ({
      updated: await tx.equipmentOperatingHourReading.updateMany({
        where: { id: `${ids.a}-hours-reading` },
        data: { reading: "999.00" },
      }),
      deleted: await tx.equipmentOperatingHourReading.deleteMany({
        where: { id: `${ids.a}-hours-reading` },
      }),
    }));
    expect(readingMutation.updated.count).toBe(0);
    expect(readingMutation.deleted.count).toBe(0);

    const movementMutation = await asTenant(ids.a, async (tx) => ({
      updated: await tx.inventoryMovement.updateMany({
        where: { id: `${ids.a}-inventory-movement` },
        data: { quantity: "999.00" },
      }),
      deleted: await tx.inventoryMovement.deleteMany({
        where: { id: `${ids.a}-inventory-movement` },
      }),
    }));
    expect(movementMutation.updated.count).toBe(0);
    expect(movementMutation.deleted.count).toBe(0);
  });

  it("isolates pending file deletion jobs by tenant", async () => {
    const jobs = await asTenant(ids.a, (tx) => tx.storedFileDeletion.findMany());
    expect(jobs.map((job) => job.id)).toEqual([`${ids.a}-delete`]);
    await expect(
      asTenant(ids.a, (tx) =>
        tx.storedFileDeletion.create({
          data: { organizationId: ids.b, key: `${ids.b}/forbidden.png` },
        }),
      ),
    ).rejects.toThrow();
  });

  it("returns nothing when no tenant is set", async () => {
    expect(await asTenant(null, (tx) => tx.site.findMany())).toEqual([]);
  });

  it("cannot read another tenant's row by id", async () => {
    const row = await asTenant(ids.a, (tx) => tx.site.findUnique({ where: { id: `${ids.b}-site` } }));
    expect(row).toBeNull();
  });

  it("rejects writing a row for another tenant", async () => {
    await expect(
      asTenant(ids.a, (tx) => tx.site.create({ data: { name: "X", organizationId: ids.b } })),
    ).rejects.toThrow();
  });

  it("does not update or delete another tenant's rows", async () => {
    const result = await asTenant(ids.a, async (tx) => ({
      updated: await tx.site.updateMany({ where: { id: `${ids.b}-site` }, data: { name: "pwn" } }),
      deleted: await tx.site.deleteMany({ where: { id: `${ids.b}-site` } }),
    }));
    expect(result.updated.count).toBe(0);
    expect(result.deleted.count).toBe(0);
  });

  it("rejects equipment that points at another tenant's site, file or section", async () => {
    const make = (data: object) =>
      asTenant(ids.a, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO "Equipment" (id, name, "organizationId", "siteId", "imageFileId") VALUES ($1, 'E', $2, $3, $4)`,
          ...(Object.values(data) as [string, string, string, string | null]),
        ),
      );
    await expect(make({ id: "e1", org: ids.a, site: `${ids.b}-site`, file: null })).rejects.toThrow();
    await expect(make({ id: "e2", org: ids.a, site: `${ids.a}-site`, file: `${ids.b}-file` })).rejects.toThrow(
      /tenant|foreign key|23503/i,
    );
    await expect(make({ id: "e3", org: ids.a, site: `${ids.a}-site`, file: `${ids.a}-file` })).resolves.toBe(1);
  });

  it("isolates tenant exports", async () => {
    await db.tenantExport.create({ data: { id: `${ids.b}-export`, organizationId: ids.b, requestedById: "u" } });
    const visible = await asTenant(ids.a, (tx) => tx.tenantExport.findMany());
    expect(visible).toEqual([]);
    await expect(
      asTenant(ids.a, (tx) => tx.tenantExport.create({ data: { organizationId: ids.b, requestedById: "u" } })),
    ).rejects.toThrow();
  });

  it("serializes concurrent partial task interval updates and rejects invalid intervals", async () => {
    const taskId = `${ids.a}-task`;
    const initial = await db.maintenanceTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { startTime: true, endTime: true },
    });
    let activeTransactions = 0;
    let releaseUpdates!: () => void;
    const bothTransactionsReady = new Promise<void>((resolve) => {
      releaseUpdates = resolve;
    });
    const updateAgainstInitialInterval = (
      data: { startTime?: Date; endTime?: Date | null },
    ) =>
      db.$transaction(async (tx) => {
        const snapshot = await tx.maintenanceTask.findUniqueOrThrow({
          where: { id: taskId },
          select: { startTime: true, endTime: true },
        });
        expect(snapshot).toEqual(initial);
        activeTransactions += 1;
        if (activeTransactions === 2) releaseUpdates();
        await bothTransactionsReady;

        return tx.maintenanceTask.update({
          where: {
            id: taskId,
            organizationId: ids.a,
            startTime: snapshot.startTime,
            endTime: snapshot.endTime,
          },
          data,
        });
      });

    const updates = await Promise.allSettled([
      updateAgainstInitialInterval({
        startTime: new Date("2026-06-30T11:00:00.000Z"),
      }),
      updateAgainstInitialInterval({
        endTime: new Date("2026-06-30T10:00:00.000Z"),
      }),
    ]);
    expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(updates.filter((result) => result.status === "rejected")).toHaveLength(1);

    const persisted = await db.maintenanceTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { startTime: true, endTime: true },
    });
    expect(persisted.endTime === null || persisted.endTime > persisted.startTime).toBe(true);

    await expect(
      db.maintenanceTask.update({
        where: { id: taskId },
        data: { endTime: new Date(persisted.startTime.getTime() - 1) },
      }),
    ).rejects.toThrow();
    const afterRejectedUpdate = await db.maintenanceTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { startTime: true, endTime: true },
    });
    expect(
      afterRejectedUpdate.endTime === null ||
        afterRejectedUpdate.endTime > afterRejectedUpdate.startTime,
    ).toBe(true);
  });

  it("lets an organization use its own file as the logo", async () => {
    const settings = await asTenant(ids.a, (tx) =>
      tx.tenantSettings.upsert({
        where: { organizationId: ids.a },
        create: { organizationId: ids.a, logoFileId: `${ids.a}-file`, timezone: "UTC", locale: "en" },
        update: { logoFileId: `${ids.a}-file` },
      }),
    );
    expect(settings.logoFileId).toBe(`${ids.a}-file`);
  });

  it("rejects another organization's file as the logo, for inserts and updates", async () => {
    await expect(
      asTenant(ids.a, (tx) =>
        tx.tenantSettings.update({ where: { organizationId: ids.a }, data: { logoFileId: `${ids.b}-file` } }),
      ),
    ).rejects.toThrow();
    await expect(
      asTenant(ids.b, (tx) =>
        tx.tenantSettings.create({ data: { organizationId: ids.b, logoFileId: `${ids.a}-file` } }),
      ),
    ).rejects.toThrow();
    expect((await db.tenantSettings.findUnique({ where: { organizationId: ids.b } }))?.logoFileId ?? null).toBeNull();
  });

  it("keeps lifecycle writes working without touching the logo", async () => {
    await asTenant(ids.a, (tx) =>
      tx.tenantSettings.update({ where: { organizationId: ids.a }, data: { status: "SUSPENDED" } }),
    );
    const row = await db.tenantSettings.findUnique({ where: { organizationId: ids.a } });
    expect(row).toMatchObject({ status: "SUSPENDED", logoFileId: `${ids.a}-file` });
  });

  it("clears the logo when its stored file is deleted", async () => {
    await asTenant(ids.a, (tx) => tx.storedFile.delete({ where: { id: `${ids.a}-file` } }));
    expect((await db.tenantSettings.findUnique({ where: { organizationId: ids.a } }))?.logoFileId).toBeNull();
  });

  it("deletes an organization together with its logo, file and settings", async () => {
    const id = `rls-c-${Date.now()}`;
    await db.organization.create({ data: { id, name: "c", slug: id, createdAt: new Date() } });
    await db.storedFile.create({
      data: { id: `${id}-file`, organizationId: id, key: `${id}/f.png`, filename: "f.png", contentType: "image/png", size: 1 },
    });
    await asTenant(id, (tx) =>
      tx.tenantSettings.create({ data: { organizationId: id, logoFileId: `${id}-file`, timezone: "UTC" } }),
    );

    await db.organization.delete({ where: { id } });

    expect(await db.tenantSettings.findUnique({ where: { organizationId: id } })).toBeNull();
    expect(await db.storedFile.findUnique({ where: { id: `${id}-file` } })).toBeNull();
  });

  it("preserves queued object deletion after an organization is deleted", async () => {
    const id = `rls-d-${Date.now()}`;
    const deletionId = `${id}-delete`;
    await db.organization.create({ data: { id, name: "d", slug: id, createdAt: new Date() } });
    await db.storedFileDeletion.create({
      data: { id: deletionId, organizationId: id, key: `${id}/pending.png` },
    });

    await db.organization.delete({ where: { id } });

    expect(await db.storedFileDeletion.findUnique({ where: { id: deletionId } })).toMatchObject({
      organizationId: id,
      key: `${id}/pending.png`,
    });
    await db.storedFileDeletion.delete({ where: { id: deletionId } });
  });
});
