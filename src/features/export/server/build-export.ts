import { zipSync, strToU8 } from "fflate";
import prisma, { type TenantDb } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";

export const EXPORT_FORMAT_VERSION = 1;

type Row = Record<string, unknown>;

/** Neutralises spreadsheet formulas in user-supplied text without touching numbers. */
function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: Row[]) {
  if (rows.length === 0) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n");
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

/**
 * Builds a ZIP with every row the organization owns (CSV + JSON per table),
 * the uploaded files and a manifest. Reads go through the tenant client, so
 * row-level security confines the export to `organizationId` even if a filter is wrong.
 */
export async function buildTenantExport(db: TenantDb, organizationId: string) {
  // `deletedAt: undefined` opts out of the soft-delete filter so trashed rows are exported too.
  const scope = { organizationId, deletedAt: undefined };
  const own = { organizationId };

  const [
    sites,
    sections,
    equipment,
    relocations,
    tasks,
    materials,
    assignments,
    workers,
    vendors,
    files,
    members,
    auditEvents,
  ] = await Promise.all([
    db.site.findMany({ where: own }),
    db.section.findMany({ where: own }),
    db.equipment.findMany({ where: scope }),
    db.equipmentRelocation.findMany({ where: own }),
    db.maintenanceTask.findMany({ where: scope }),
    db.material.findMany({ where: own }),
    db.maintenanceTaskAssignment.findMany({ where: own }),
    db.worker.findMany({ where: scope }),
    db.vendor.findMany({ where: own }),
    db.storedFile.findMany({ where: own }),
    prisma.member.findMany({
      where: { organizationId },
      select: { id: true, role: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
    prisma.organizationAuditEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
  ]);

  const tables: Record<string, Row[]> = {
    sites,
    sections,
    equipment,
    equipment_relocations: relocations,
    maintenance_tasks: tasks,
    materials,
    task_assignments: assignments,
    workers,
    vendors,
    files: files.map((file) => Object.fromEntries(Object.entries(file).filter(([name]) => name !== "key"))),
    members: members.map(({ user, ...member }) => ({ ...member, name: user.name, email: user.email })),
    audit_events: auditEvents,
  };

  const archive: Record<string, Uint8Array> = {};
  for (const [name, rows] of Object.entries(tables)) {
    archive[`data/${name}.json`] = strToU8(JSON.stringify(rows, null, 2));
    archive[`data/${name}.csv`] = strToU8(toCsv(rows));
  }

  const storage = getStorage();
  const missingFiles: string[] = [];
  for (const file of files) {
    const object = await storage.get(file.key).catch(() => null);
    if (!object) {
      missingFiles.push(file.id);
      continue;
    }
    archive[`files/${file.id}-${safeName(file.filename)}`] = new Uint8Array(object.body);
  }

  archive["manifest.json"] = strToU8(
    JSON.stringify(
      {
        formatVersion: EXPORT_FORMAT_VERSION,
        organizationId,
        generatedAt: new Date().toISOString(),
        rowCounts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
        files: { included: files.length - missingFiles.length, missing: missingFiles },
        notes:
          "Rows with a deletedAt value were in the trash when exported. Files are named <file id>-<filename>; tables reference files by id.",
      },
      null,
      2,
    ),
  );

  return zipSync(archive);
}
