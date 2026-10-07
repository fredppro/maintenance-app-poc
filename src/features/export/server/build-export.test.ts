import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { buildTenantExport, toCsv } from "./build-export";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ get: mocks.get }) }));
vi.mock("@/lib/prisma", () => ({
  default: {
    member: {
      findMany: vi.fn().mockResolvedValue([
        { id: "m1", role: "owner", createdAt: new Date(0), user: { name: "Ana", email: "ana@example.com" } },
      ]),
    },
    organizationAuditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

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

  it("scopes every query to the organization and packages data, files and manifest", async () => {
    mocks.get.mockResolvedValue({ body: Buffer.from("img"), contentType: "image/png" });
    const db = {
      site: table([{ id: "s1", organizationId: "org-1", name: "HQ" }]),
      section: table(),
      equipment: table([{ id: "e1", name: "Pump", deletedAt: new Date(0) }]),
      equipmentRelocation: table(),
      maintenanceTask: table(),
      material: table(),
      maintenanceTaskAssignment: table(),
      worker: table(),
      vendor: table(),
      storedFile: table([{ id: "f1", key: "org-1/f1.png", filename: "pump.png" }]),
    };

    const files = unzipSync(await buildTenantExport(db as never, "org-1"));

    expect(db.site.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1" } });
    expect(db.equipment.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", deletedAt: undefined },
    });
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["manifest.json", "data/sites.csv", "data/equipment.json", "files/f1-pump.png"]),
    );
    expect(strFromU8(files["data/files.json"])).not.toContain("org-1/f1.png");
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.organizationId).toBe("org-1");
    expect(manifest.rowCounts.members).toBe(1);
    expect(strFromU8(files["data/members.csv"])).toContain("ana@example.com");
  });

  it("reports files missing from storage instead of failing", async () => {
    mocks.get.mockRejectedValue(new Error("gone"));
    const db = Object.fromEntries(
      ["site", "section", "equipment", "equipmentRelocation", "maintenanceTask", "material", "maintenanceTaskAssignment", "worker", "vendor"].map(
        (name) => [name, table()],
      ),
    );
    const files = unzipSync(
      await buildTenantExport({ ...db, storedFile: table([{ id: "f9", key: "k", filename: "a.png" }]) } as never, "org-1"),
    );
    expect(JSON.parse(strFromU8(files["manifest.json"])).files.missing).toEqual(["f9"]);
  });
});
