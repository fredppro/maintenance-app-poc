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
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.organization.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await db.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`);
    await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`);
  });

  it("only exposes the active tenant's rows", async () => {
    const sites = await asTenant(ids.a, (tx) => tx.site.findMany());
    expect(sites.map((s) => s.id)).toEqual([`${ids.a}-site`]);
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
});
