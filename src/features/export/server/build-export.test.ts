import { unzipSync, strFromU8 } from "fflate";
import { randomBytes } from "node:crypto";
import { open, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EXPORT_ATTACHMENT_BYTES,
  MAX_EXPORT_ARCHIVE_BYTES,
  MAX_EXPORT_ARCHIVE_INPUT_BYTES,
  MAX_EXPORT_QUERY_BATCH_SIZE,
  MAX_EXPORT_RECORD_BYTES,
  MAX_EXPORT_ROWS,
} from "../export-policy";
import { buildTenantExport, toCsv } from "./build-export";

const mocks = vi.hoisted(() => ({ getStream: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ getStream: mocks.getStream }),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    member: {
      findMany: vi.fn().mockResolvedValue([
        { id: "m1", role: "owner", createdAt: new Date(0), user: { name: "Ana", email: "ana@example.com" } },
      ]),
    },
    organizationAuditEvent: { findMany: vi.fn().mockResolvedValue([]) },
    organization: {
      findUnique: vi.fn().mockResolvedValue({
        id: "org-1",
        name: "ACME",
        slug: "acme-1",
        logo: "https://example.test/logo.png",
        metadata: "{\"industry\":\"maintenance\"}",
        createdAt: new Date(0),
      }),
    },
    tenantSettings: {
      findUnique: vi.fn().mockResolvedValue({
        contactEmail: "office@acme.pt",
        contactPhone: null,
        timezone: "Europe/Lisbon",
        locale: "en",
        logoFileId: "f1",
      }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toCsv", () => {
  it("escapes quotes, commas and neutralises formulas", () => {
    const csv = toCsv([{ name: 'He said "hi", ok', note: "=HYPERLINK(1)", qty: -5 }]);
    expect(csv).toBe('name,note,qty\r\n"He said ""hi"", ok",\'=HYPERLINK(1),-5');
  });

  it("returns an empty file for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("buildTenantExport", () => {
  const table = (rows: object[] = []) => ({ findMany: vi.fn().mockResolvedValue(rows) });
  const emptyDatabase = (storedFiles: object[] = []) =>
    Object.fromEntries(
      [
        "site",
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "storedFile",
        "invitation",
      ].map((name) => [
        name,
        table(name === "storedFile" ? storedFiles : []),
      ]),
    );
  const withTenantTransaction = <T extends object>(db: T) => {
    const tx = Object.assign(
      {
        organization: {
          findUnique: vi.fn().mockResolvedValue({
            id: "org-1",
            name: "ACME",
            slug: "acme-1",
            logo: "https://example.test/logo.png",
            metadata: "{\"industry\":\"maintenance\"}",
            createdAt: new Date(0),
          }),
        },
        tenantSettings: {
          findUnique: vi.fn().mockResolvedValue({
            contactEmail: "office@acme.pt",
            contactPhone: null,
            timezone: "Europe/Lisbon",
            locale: "en",
            logoFileId: "f1",
          }),
        },
        member: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "m1",
              role: "owner",
              createdAt: new Date(0),
              user: { name: "Ana", email: "ana@example.com" },
            },
          ]),
        },
        organizationAuditEvent: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      db,
    );
    const transactionOptions: unknown[] = [];
    const transaction = (
      callback: (tx: never) => Promise<unknown>,
      options?: { isolationLevel: string },
    ) => {
      transactionOptions.push(options);
      return callback(tx as never);
    };
    return Object.assign(tx, {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      transaction,
      transactionOptions,
    });
  };

  const exportFiles = async (db: object) => {
    const artifact = await buildTenantExport(
      withTenantTransaction(db) as never,
      "org-1",
    );
    try {
      return unzipSync(await readFile(artifact.path));
    } finally {
      await artifact.cleanup();
    }
  };

  it("scopes every query to the organization and packages data, files and manifest", async () => {
    mocks.getStream.mockResolvedValue({
      body: Readable.from([Buffer.from("img")]),
      contentType: "image/png",
      contentLength: 3,
    });
    const db = {
      site: table([{ id: "s1", organizationId: "org-1", name: "HQ" }]),
      section: table(),
      equipment: table([{ id: "e1", name: "Pump", deletedAt: new Date(0) }]),
      equipmentRelocation: table(),
      maintenanceTask: table(),
      equipmentMaintenancePoint: table([{ id: "point-1", organizationId: "org-1", name: "Motor" }]),
      equipmentPointChecklistItem: table([{ id: "point-check-1", organizationId: "org-1" }]),
      maintenanceTaskChecklistItem: table([{ id: "task-check-1", organizationId: "org-1" }]),
      equipmentOperatingHourReading: table([{ id: "reading-1", organizationId: "org-1" }]),
      material: table(),
      inventoryItem: table([{ id: "inventory-1", organizationId: "org-1" }]),
      inventoryMovement: table([{ id: "movement-1", organizationId: "org-1" }]),
      maintenanceTaskReminder: table([{ id: "reminder-1", organizationId: "org-1" }]),
      maintenanceTaskAssignment: table(),
      maintenanceTaskDailyHours: table([{ id: "hours-1", organizationId: "org-1" }]),
      worker: table(),
      vendor: table(),
      storedFile: table([
        {
          id: "f1",
          key: "org-1/f1.png",
          filename: "pump.png",
          size: 3,
        },
      ]),
      invitation: table([{ id: "invite-1", organizationId: "org-1", email: "worker@example.test" }]),
    };

    const files = await exportFiles(db);

    expect(db.site.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      orderBy: { id: "asc" },
      take: MAX_EXPORT_QUERY_BATCH_SIZE,
    });
    expect(db.equipment.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", deletedAt: undefined },
      orderBy: { id: "asc" },
      take: MAX_EXPORT_QUERY_BATCH_SIZE,
    });
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "data/sites.csv",
        "data/equipment.json",
        "data/maintenance_points.json",
        "data/equipment_point_checklist_items.json",
        "data/task_checklist_items.json",
        "data/equipment_operating_hour_readings.json",
        "data/inventory_items.json",
        "data/inventory_movements.json",
        "data/maintenance_task_reminders.json",
        "data/daily_worker_hours.json",
        "data/invitations.json",
        "files/f1-pump.png",
      ]),
    );
    for (const model of [
      "equipmentMaintenancePoint",
      "equipmentPointChecklistItem",
      "maintenanceTaskChecklistItem",
      "equipmentOperatingHourReading",
      "inventoryItem",
      "inventoryMovement",
      "maintenanceTaskReminder",
      "maintenanceTaskDailyHours",
      "invitation",
    ] as const) {
      expect(db[model].findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        orderBy: { id: "asc" },
        take: expect.any(Number),
      });
    }
    expect(JSON.parse(strFromU8(files["data/sites.json"]))).toEqual([
      { id: "s1", organizationId: "org-1", name: "HQ" },
    ]);
    expect(strFromU8(files["data/sites.csv"])).toContain("id,organizationId,name");
    expect(strFromU8(files["data/files.json"])).not.toContain("org-1/f1.png");
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.organizationId).toBe("org-1");
    expect(manifest.rowCounts.members).toBe(1);
    expect(manifest.rowCounts.maintenance_points).toBe(1);
    expect(manifest.rowCounts.daily_worker_hours).toBe(1);
    expect(manifest.rowCounts.invitations).toBe(1);
    expect(strFromU8(files["data/members.csv"])).toContain("ana@example.com");

    const [profile] = JSON.parse(strFromU8(files["data/organization.json"]));
    expect(profile).toMatchObject({
      id: "org-1",
      name: "ACME",
      logo: "https://example.test/logo.png",
      metadata: "{\"industry\":\"maintenance\"}",
      contactEmail: "office@acme.pt",
      timezone: "Europe/Lisbon",
      locale: "en",
      logoFileId: "f1",
    });
    expect(profile).not.toHaveProperty("status");
    expect(manifest.rowCounts.organization).toBe(1);
  });

  it("reports files missing from storage instead of failing", async () => {
    mocks.getStream.mockResolvedValue(null);
    const db = Object.fromEntries(
      [
        "site",
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "invitation",
      ].map(
        (name) => [name, table()],
      ),
    );
    const files = await exportFiles({
      ...db,
      storedFile: table([
        { id: "f9", key: "k", filename: "a.png", size: 1 },
      ]),
    });
    expect(JSON.parse(strFromU8(files["manifest.json"])).files.missing).toEqual(["f9"]);
  });

  it("streams a boundary-sized attachment into the export without buffering it", async () => {
    const body = Buffer.alloc(MAX_EXPORT_ATTACHMENT_BYTES, 0x61);
    mocks.getStream.mockResolvedValue({
      body: Readable.from([body]),
      contentType: "application/octet-stream",
      contentLength: body.byteLength,
    });
    const db = withTenantTransaction(
      emptyDatabase([
        {
          id: "boundary-file",
          key: "org-1/boundary.bin",
          filename: "boundary.bin",
          size: body.byteLength,
        },
      ]),
    );

    const artifact = await buildTenantExport(db as never, "org-1");
    try {
      const entries = unzipSync(await readFile(artifact.path));
      expect(entries["files/boundary-file-boundary.bin"]).toHaveLength(
        MAX_EXPORT_ATTACHMENT_BYTES,
      );
    } finally {
      await artifact.cleanup();
    }
  });

  it("rejects streamed bytes over the attachment limit", async () => {
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    async function* oversizedBody() {
      for (let remaining = MAX_EXPORT_ATTACHMENT_BYTES + 1; remaining > 0; ) {
        const nextSize = Math.min(chunk.byteLength, remaining);
        yield nextSize === chunk.byteLength ? chunk : chunk.subarray(0, nextSize);
        remaining -= nextSize;
      }
    }
    mocks.getStream.mockResolvedValue({
      body: Readable.from(oversizedBody()),
      contentType: "application/octet-stream",
      contentLength: null,
    });
    const db = withTenantTransaction(
      emptyDatabase([
        {
          id: "oversized-file",
          key: "org-1/oversized.bin",
          filename: "oversized.bin",
          size: MAX_EXPORT_ATTACHMENT_BYTES,
        },
      ]),
    );

    await expect(
      buildTenantExport(db as never, "org-1"),
    ).rejects.toThrow(/48 MiB/);
  });

  it("rejects streamed attachment bytes that exceed database size metadata", async () => {
    mocks.getStream.mockResolvedValue({
      body: Readable.from([Buffer.from("abc")]),
      contentType: "application/octet-stream",
      contentLength: null,
    });
    const db = withTenantTransaction(
      emptyDatabase([
        {
          id: "metadata-small",
          key: "org-1/metadata-small.bin",
          filename: "metadata-small.bin",
          size: 2,
        },
      ]),
    );

    await expect(
      buildTenantExport(db as never, "org-1"),
    ).rejects.toThrow(/exceeds its database metadata size/);
  });

  it("rejects streamed attachment bytes smaller than database size metadata", async () => {
    mocks.getStream.mockResolvedValue({
      body: Readable.from([Buffer.from("ab")]),
      contentType: "application/octet-stream",
      contentLength: null,
    });
    const db = withTenantTransaction(
      emptyDatabase([
        {
          id: "metadata-large",
          key: "org-1/metadata-large.bin",
          filename: "metadata-large.bin",
          size: 3,
        },
      ]),
    );

    await expect(
      buildTenantExport(db as never, "org-1"),
    ).rejects.toThrow(/does not match its database metadata/);
  });

  it("propagates interrupted attachment reads and removes partial staging files", async () => {
    async function* interruptedBody() {
      yield Buffer.from("partial");
      throw new Error("read interrupted");
    }
    mocks.getStream.mockResolvedValue({
      body: Readable.from(interruptedBody()),
      contentType: "application/octet-stream",
      contentLength: null,
    });
    const db = withTenantTransaction(
      emptyDatabase([
        {
          id: "interrupted-file",
          key: "org-1/interrupted.bin",
          filename: "interrupted.bin",
          size: 20,
        },
      ]),
    );
    const temporaryBefore = (await readdir(os.tmpdir())).filter((name) =>
      name.startsWith("tenant-export-"),
    );

    await expect(
      buildTenantExport(db as never, "org-1"),
    ).rejects.toThrow(/read interrupted/);
    const temporaryAfter = (await readdir(os.tmpdir())).filter((name) =>
      name.startsWith("tenant-export-"),
    );
    expect(temporaryAfter).toEqual(temporaryBefore);
  });

  it("propagates storage provider failures instead of treating them as missing files", async () => {
    mocks.getStream.mockRejectedValue(new Error("storage timeout"));
    const db = withTenantTransaction(
      emptyDatabase([
        {
          id: "provider-error-file",
          key: "org-1/provider-error.bin",
          filename: "provider-error.bin",
          size: 1,
        },
      ]),
    );

    await expect(
      buildTenantExport(db as never, "org-1"),
    ).rejects.toThrow("storage timeout");
  });

  it("reads large tables in bounded pages without changing their export contents", async () => {
    const sites = Array.from({ length: MAX_EXPORT_QUERY_BATCH_SIZE + 1 }, (_, index) => ({
      id: `site-${String(index).padStart(4, "0")}`,
      organizationId: "org-1",
      name: `Site ${index}`,
    }));
    const siteFindMany = vi.fn(({ take, cursor }: { take: number; cursor?: { id: string } }) => {
      const offset = cursor ? Number(cursor.id.slice("site-".length)) + 1 : 0;
      return Promise.resolve(sites.slice(offset, offset + take));
    });
    const db = Object.fromEntries(
      [
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "storedFile",
        "invitation",
      ].map((name) => [name, table()]),
    );
    db.site = { findMany: siteFindMany };

    const files = await exportFiles(db);

    expect(siteFindMany).toHaveBeenCalledTimes(2);
    expect(siteFindMany.mock.calls[0][0].take).toBe(MAX_EXPORT_QUERY_BATCH_SIZE);
    expect(siteFindMany.mock.calls[1][0]).toMatchObject({
      take: MAX_EXPORT_QUERY_BATCH_SIZE,
      cursor: { id: `site-${String(MAX_EXPORT_QUERY_BATCH_SIZE - 1).padStart(4, "0")}` },
      skip: 1,
    });
    expect(JSON.parse(strFromU8(files["data/sites.json"]))).toEqual(sites);
    expect(strFromU8(files["data/sites.csv"]).split("\r\n")).toHaveLength(sites.length + 1);
  });

  it.skipIf(process.env.RUN_EXPORT_STRESS !== "1")(
    "builds a large export from generated database pages",
    async () => {
      const rowCount = 25_000;
      const payload = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .repeat(12)
        .slice(0, 700);
      const siteFindManyCalls: { take: number; cursor?: { id: string } }[] = [];
      const siteFindMany = ({
        take,
        cursor,
      }: {
        take: number;
        cursor?: { id: string };
      }) => {
        siteFindManyCalls.push({ take, cursor });
        const offset = cursor
          ? Number(cursor.id.slice("site-".length)) + 1
          : 0;
        const count = Math.min(take, rowCount - offset);
        const page = Array.from({ length: count }, (_, index) => {
          const rowIndex = offset + index;
          return {
            id: `site-${String(rowIndex).padStart(6, "0")}`,
            organizationId: "org-1",
            name: `Site ${rowIndex}`,
            description: `${rowIndex.toString(36).padStart(6, "0")}${payload}`,
          };
        });
        return Promise.resolve(page);
      };
      const db = Object.fromEntries(
        [
          "section",
          "equipment",
          "equipmentRelocation",
          "maintenanceTask",
          "equipmentMaintenancePoint",
          "equipmentPointChecklistItem",
          "maintenanceTaskChecklistItem",
          "equipmentOperatingHourReading",
          "material",
          "inventoryItem",
          "inventoryMovement",
          "maintenanceTaskReminder",
          "maintenanceTaskAssignment",
          "maintenanceTaskDailyHours",
          "worker",
          "vendor",
          "storedFile",
          "invitation",
        ].map((name) => [name, table()]),
      );
      Reflect.set(db, "site", { findMany: siteFindMany });

      const baselineMemory = process.memoryUsage();
      const baselineRss = baselineMemory.rss;
      let peakRss = baselineRss;
      let peakHeapUsed = baselineMemory.heapUsed;
      let peakExternal = baselineMemory.external;
      let peakArrayBuffers = baselineMemory.arrayBuffers;
      const sampler = setInterval(() => {
        const memory = process.memoryUsage();
        peakRss = Math.max(peakRss, memory.rss);
        peakHeapUsed = Math.max(peakHeapUsed, memory.heapUsed);
        peakExternal = Math.max(peakExternal, memory.external);
        peakArrayBuffers = Math.max(peakArrayBuffers, memory.arrayBuffers);
      }, 10);
      let artifact: Awaited<ReturnType<typeof buildTenantExport>> | undefined;
      try {
        artifact = await buildTenantExport(
          withTenantTransaction(db) as never,
          "org-1",
        );
      } finally {
        clearInterval(sampler);
      }
      peakRss = Math.max(peakRss, process.memoryUsage.rss());
      const peakMemory = process.memoryUsage();
      peakHeapUsed = Math.max(peakHeapUsed, peakMemory.heapUsed);
      peakExternal = Math.max(peakExternal, peakMemory.external);
      peakArrayBuffers = Math.max(peakArrayBuffers, peakMemory.arrayBuffers);
      const forceGc = (
        globalThis as typeof globalThis & { gc?: () => void }
      ).gc;
      forceGc?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
      forceGc?.();
      const retainedMemory = process.memoryUsage();
      console.info(
        `[export-stress] rows=${rowCount} baselineRssBytes=${baselineRss} peakRssBytes=${peakRss} rssIncreaseBytes=${peakRss - baselineRss} baselineHeapUsedBytes=${baselineMemory.heapUsed} peakHeapUsedBytes=${peakHeapUsed} heapIncreaseBytes=${peakHeapUsed - baselineMemory.heapUsed} baselineExternalBytes=${baselineMemory.external} peakExternalBytes=${peakExternal} externalIncreaseBytes=${peakExternal - baselineMemory.external} baselineArrayBuffersBytes=${baselineMemory.arrayBuffers} peakArrayBuffersBytes=${peakArrayBuffers} arrayBuffersIncreaseBytes=${peakArrayBuffers - baselineMemory.arrayBuffers}`,
      );
      console.info(
        `[export-stress-retained] rssBytes=${retainedMemory.rss} heapUsedBytes=${retainedMemory.heapUsed} externalBytes=${retainedMemory.external} arrayBuffersBytes=${retainedMemory.arrayBuffers} gcAvailable=${Boolean(forceGc)}`,
      );
      expect(artifact?.size).toBeGreaterThan(2);
      if (!artifact) throw new Error("Export artifact was not created");
      const archive = await open(artifact.path, "r");
      try {
        const header = Buffer.alloc(2);
        await archive.read(header, 0, 2, 0);
        expect(header).toEqual(Buffer.from([0x50, 0x4b]));
      } finally {
        await archive.close();
        await artifact.cleanup();
      }
      expect(peakRss - baselineRss).toBeLessThan(160 * 1024 * 1024);
      expect(peakHeapUsed - baselineMemory.heapUsed).toBeLessThan(
        80 * 1024 * 1024,
      );
      expect(peakExternal - baselineMemory.external).toBeLessThan(
        32 * 1024 * 1024,
      );
      expect(siteFindManyCalls).toHaveLength(
        Math.ceil(rowCount / MAX_EXPORT_QUERY_BATCH_SIZE) +
          Number(rowCount % MAX_EXPORT_QUERY_BATCH_SIZE === 0),
      );
      expect(
        Math.max(...siteFindManyCalls.map(({ take }) => take)),
      ).toBe(MAX_EXPORT_QUERY_BATCH_SIZE);
    },
    60_000,
  );

  it("rejects an oversized serialized record", async () => {
    const db = Object.fromEntries(
      [
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "storedFile",
        "invitation",
      ].map((name) => [name, table()]),
    );
    db.site = table([
      {
        id: "oversized-site",
        organizationId: "org-1",
        description: "x".repeat(MAX_EXPORT_ARCHIVE_INPUT_BYTES + 1),
      },
    ]);

    await expect(
      buildTenantExport(withTenantTransaction(db) as never, "org-1"),
    ).rejects.toThrow(/128 KiB per record/);
  });

  it("enforces the cumulative archive-input limit across table rows", async () => {
    const sites = Array.from({ length: 250 }, (_, index) => ({
      id: `site-${String(index).padStart(4, "0")}`,
      organizationId: "org-1",
      description: "x".repeat(110_000),
    }));
    const db = Object.fromEntries(
      [
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "storedFile",
        "invitation",
      ].map((name) => [name, table()]),
    );
    db.site = {
      findMany: vi.fn(({ take, cursor }: { take: number; cursor?: { id: string } }) => {
        const offset = cursor ? Number(cursor.id.slice("site-".length)) + 1 : 0;
        return Promise.resolve(sites.slice(offset, offset + take));
      }),
    };

    await expect(
      buildTenantExport(withTenantTransaction(db) as never, "org-1"),
    ).rejects.toThrow(/48 MiB/);
  });

  it("rejects a database record over the per-record limit before materializing it", async () => {
    const siteFindMany = vi.fn().mockResolvedValue([]);
    const db = withTenantTransaction({
      site: { findMany: siteFindMany },
      ...Object.fromEntries(
        [
          "section",
          "equipment",
          "equipmentRelocation",
          "maintenanceTask",
          "equipmentMaintenancePoint",
          "equipmentPointChecklistItem",
          "maintenanceTaskChecklistItem",
          "equipmentOperatingHourReading",
          "material",
          "inventoryItem",
          "inventoryMovement",
          "maintenanceTaskReminder",
          "maintenanceTaskAssignment",
          "maintenanceTaskDailyHours",
          "worker",
          "vendor",
          "storedFile",
          "invitation",
        ].map((name) => [name, table()]),
      ),
    });

    db.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "oversized-site", serializedBytes: MAX_EXPORT_RECORD_BYTES + 1 },
      ]);

    const temporaryBefore = (await readdir(os.tmpdir())).filter((name) =>
      name.startsWith("tenant-export-"),
    );
    await expect(
      buildTenantExport(db as never, "org-1"),
    ).rejects.toThrow(/128 KiB per record/);
    const temporaryAfter = (await readdir(os.tmpdir())).filter((name) =>
      name.startsWith("tenant-export-"),
    );
    expect(temporaryAfter).toEqual(temporaryBefore);
    expect(db.$queryRawUnsafe.mock.calls[1][0]).toContain('FROM "Site"');
    expect(db.$queryRawUnsafe.mock.calls[1][0]).toContain("jsonb_pretty");
    expect(db.$queryRawUnsafe.mock.calls[1][0]).toContain("convert_to");
    expect(db.$queryRawUnsafe.mock.calls[1][0]).toContain("FROM jsonb_each");
    expect(db.$queryRawUnsafe.mock.calls[1][0]).toContain("strpos");
    expect(db.$queryRawUnsafe.mock.calls[1][0]).toContain("::double precision");
    expect(siteFindMany).not.toHaveBeenCalled();
    expect(db.transactionOptions).toContainEqual({
      isolationLevel: "RepeatableRead",
    });
  });

  it("preserves incompressible values in the streamed JSON, CSV and ZIP entries", async () => {
    const description = randomBytes(48 * 1024).toString("base64");
    const db = Object.fromEntries(
      [
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "storedFile",
        "invitation",
      ].map((name) => [name, table()]),
    );
    db.site = table([
      { id: "site-random", organizationId: "org-1", description },
    ]);

    const files = await exportFiles(db);
    const [jsonRow] = JSON.parse(strFromU8(files["data/sites.json"]));
    const csvRows = strFromU8(files["data/sites.csv"]).split("\r\n");
    expect(jsonRow.description).toBe(description);
    expect(csvRows[1]).toContain(description);
    expect(files["data/sites.json"].byteLength).toBeGreaterThan(60 * 1024);
  });

  it("stores large ZIP entries without changing their exported contents", async () => {
    const description = randomBytes(750).toString("base64");
    const db = Object.fromEntries(
      [
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "storedFile",
        "invitation",
      ].map((name) => [name, table()]),
    );
    const siteRows = Array.from({ length: 400 }, (_, index) => ({
        id: `site-${String(index).padStart(4, "0")}`,
        organizationId: "org-1",
        description,
    }));
    db.site = {
      findMany: vi.fn(async ({ take, cursor }: { take: number; cursor?: { id: string } }) => {
        const cursorIndex = cursor
          ? siteRows.findIndex((row) => row.id === cursor.id)
          : -1;
        return siteRows.slice(cursorIndex + 1, cursorIndex + 1 + take);
      }),
    };

    const artifact = await buildTenantExport(
      withTenantTransaction(db) as never,
      "org-1",
    );
    try {
      const archive = await readFile(artifact.path);
      expect(archive.readUInt16LE(8)).toBe(0);
      const files = unzipSync(archive);
      expect(JSON.parse(strFromU8(files["data/sites.json"]))).toHaveLength(400);
      expect(JSON.parse(strFromU8(files["data/sites.json"]))[0].description).toBe(
        description,
      );
    } finally {
      await artifact.cleanup();
    }
  });

  it("keeps a near-limit stored ZIP below the archive-size limit", async () => {
    const description = "x".repeat(96 * 1024);
    const siteRows = Array.from({ length: 250 }, (_, index) => ({
      id: `site-${String(index).padStart(4, "0")}`,
      organizationId: "org-1",
      description,
    }));
    const db = emptyDatabase();
    db.site = {
      findMany: vi.fn(async ({ take, cursor }: { take: number; cursor?: { id: string } }) => {
        const cursorIndex = cursor
          ? siteRows.findIndex((row) => row.id === cursor.id)
          : -1;
        return siteRows.slice(cursorIndex + 1, cursorIndex + 1 + take);
      }),
    };

    const artifact = await buildTenantExport(
      withTenantTransaction(db) as never,
      "org-1",
    );
    try {
      console.info(`[export-zip-near-limit] archiveBytes=${artifact.size}`);
      expect(artifact.size).toBeGreaterThan(44 * 1024 * 1024);
      expect(artifact.size).toBeLessThan(MAX_EXPORT_ARCHIVE_BYTES);
      const archive = await open(artifact.path, "r");
      try {
        const signature = Buffer.alloc(4);
        await archive.read(signature, 0, signature.byteLength, 0);
        expect(signature).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      } finally {
        await archive.close();
      }
    } finally {
      await artifact.cleanup();
    }
  });

  it(
    "rejects a dataset over the row limit before creating an archive",
    async () => {
    const oversizedSites = Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, index) => ({
      id: `site-${index}`,
      organizationId: "org-1",
    }));
    const db = Object.fromEntries(
      [
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "storedFile",
        "invitation",
      ].map((name) => [name, table()]),
    );
    db.site = {
      findMany: vi.fn(({ take, cursor }: { take: number; cursor?: { id: string } }) => {
        const offset = cursor ? Number(cursor.id.slice("site-".length)) + 1 : 0;
        return Promise.resolve(oversizedSites.slice(offset, offset + take));
      }),
    };

    await expect(
      buildTenantExport(withTenantTransaction(db) as never, "org-1"),
    ).rejects.toThrow(
      /50,000 rows/,
    );
      expect(mocks.getStream).not.toHaveBeenCalled();
    },
    20_000,
  );

  it("rejects oversized stored files before reading their bytes", async () => {
    const db = Object.fromEntries(
      [
        "site",
        "section",
        "equipment",
        "equipmentRelocation",
        "maintenanceTask",
        "equipmentMaintenancePoint",
        "equipmentPointChecklistItem",
        "maintenanceTaskChecklistItem",
        "equipmentOperatingHourReading",
        "material",
        "inventoryItem",
        "inventoryMovement",
        "maintenanceTaskReminder",
        "maintenanceTaskAssignment",
        "maintenanceTaskDailyHours",
        "worker",
        "vendor",
        "invitation",
      ].map((name) => [name, table()]),
    );
    db.storedFile = table([
      {
        id: "large-file",
        key: "org-1/large.png",
        filename: "large.png",
        size: MAX_EXPORT_ARCHIVE_INPUT_BYTES + 1,
      },
    ]);

    await expect(
      buildTenantExport(withTenantTransaction(db) as never, "org-1"),
    ).rejects.toThrow(/48 MiB/);
    expect(mocks.getStream).not.toHaveBeenCalled();
  });
});
