import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  open,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { finished, pipeline } from "node:stream/promises";
import type { Writable } from "node:stream";
import { Transform } from "node:stream";
import type { TenantDb } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { StorageObjectIntegrityError } from "@/lib/storage/types";
import {
  MAX_EXPORT_ATTACHMENT_BYTES,
  ExportSizeLimitError,
  MAX_EXPORT_ARCHIVE_BYTES,
  MAX_EXPORT_ARCHIVE_INPUT_BYTES,
  MAX_EXPORT_QUERY_BATCH_SIZE,
  MAX_EXPORT_RECORD_BYTES,
  MAX_EXPORT_ROWS,
} from "../export-policy";

export const EXPORT_FORMAT_VERSION = 1;

type Row = object;
type TenantTransaction = Parameters<
  Parameters<TenantDb["transaction"]>[0]
>[0];

type ExportPreflight = {
  tableName:
    | "Site"
    | "Section"
    | "Equipment"
    | "EquipmentRelocation"
    | "MaintenanceTask"
    | "EquipmentMaintenancePoint"
    | "EquipmentPointChecklistItem"
    | "MaintenanceTaskChecklistItem"
    | "EquipmentOperatingHourReading"
    | "Material"
    | "InventoryItem"
    | "InventoryMovement"
    | "MaintenanceTaskReminder"
    | "MaintenanceTaskAssignment"
    | "MaintenanceTaskDailyHours"
    | "Worker"
    | "Vendor"
    | "member"
    | "invitation"
    | "organization_audit_event"
    | "organization"
    | "tenant_settings"
    | "StoredFile";
  scopeColumn?: "organizationId" | "id";
  cursorOrder?: "id" | "createdAt-id";
  joinUser?: boolean;
  organizationProfile?: boolean;
};

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
  const columnSet = new Set<string>();
  for (const row of rows) {
    for (const column of Object.keys(row)) columnSet.add(column);
  }
  const columns = [...columnSet];
  return [
    columns.join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(Reflect.get(row, column))).join(","),
    ),
  ].join("\r\n");
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

function rowId(row: Row) {
  const id = Reflect.get(row, "id");
  if (typeof id !== "string") {
    throw new Error("Export row is missing its pagination id");
  }
  return id;
}

type TableSource<T extends Row = Row> = {
  name: string;
  preflight: ExportPreflight | ExportPreflight[];
  load: (
    tx: TenantTransaction,
    take: number,
    cursor?: string,
  ) => Promise<T[]>;
};

async function assertPreflightRowsFit(
  tx: TenantTransaction,
  target: ExportPreflight,
  organizationId: string,
  take: number,
  cursor?: string,
) {
  const table = `"${target.tableName}"`;
  const scopeColumn = `"${target.scopeColumn ?? "organizationId"}"`;
  const cursorCondition =
    target.cursorOrder === "createdAt-id"
      ? `($2::text IS NULL OR (export_row."createdAt", export_row."id") > (
          SELECT anchor."createdAt", anchor."id"
          FROM ${table} AS anchor
          WHERE anchor."id" = $2 AND anchor.${scopeColumn} = $1
        ))`
      : `($2::text IS NULL OR export_row."id" > $2)`;
  const joins = target.joinUser
    ? `JOIN "user" AS export_user ON export_user."id" = export_row."userId"`
    : target.organizationProfile
      ? `LEFT JOIN "tenant_settings" AS export_settings
         ON export_settings."organizationId" = export_row."id"`
      : "";
  const rowJson = target.joinUser
    ? `jsonb_build_object(
         'id', export_row."id",
         'role', export_row."role",
         'createdAt', export_row."createdAt",
         'name', export_user."name",
         'email', export_user."email"
       )`
    : target.organizationProfile
      ? `jsonb_build_object(
           'id', export_row."id",
           'name', export_row."name",
           'slug', export_row."slug",
           'logo', export_row."logo",
           'metadata', export_row."metadata",
           'createdAt', export_row."createdAt",
           'contactEmail', export_settings."contactEmail",
           'contactPhone', export_settings."contactPhone",
           'timezone', export_settings."timezone",
           'locale', export_settings."locale",
           'logoFileId', export_settings."logoFileId"
         )`
      : `to_jsonb(export_row)`;
  const prettyBytes = `octet_length(convert_to(jsonb_pretty(${rowJson}), 'UTF8'))`;
  const fieldCount = `jsonb_object_length(${rowJson})`;
  const csvUpperBytes = `(
    SELECT COALESCE(SUM(
      CASE jsonb_typeof(export_field.value)
        WHEN 'string' THEN
          octet_length(convert_to(export_field.value #>> '{}', 'UTF8'))
          + length(export_field.value #>> '{}')
            - length(replace(export_field.value #>> '{}', '"', ''))
          + CASE
              WHEN strpos(export_field.value #>> '{}', '"') > 0
                OR strpos(export_field.value #>> '{}', ',') > 0
                OR strpos(export_field.value #>> '{}', E'\\r') > 0
                OR strpos(export_field.value #>> '{}', E'\\n') > 0
              THEN 2 ELSE 0
            END
          + CASE
              WHEN left(export_field.value #>> '{}', 1)
                IN ('=', '+', '-', '@', chr(9), chr(13))
              THEN 1 ELSE 0
            END
        WHEN 'object' THEN
          (octet_length(convert_to(export_field.value::text, 'UTF8')) * 2) + 2
        WHEN 'array' THEN
          (octet_length(convert_to(export_field.value::text, 'UTF8')) * 2) + 2
        ELSE octet_length(convert_to(export_field.value::text, 'UTF8')) + 8
      END
    ), 0)
    + GREATEST(${fieldCount} - 1, 0)
    + (${fieldCount} * 8)
    + 64
    FROM jsonb_each(${rowJson}) AS export_field(key, value)
  )`;
  const serializedBytes = `GREATEST(
    ${prettyBytes} + (${fieldCount} * 16) + 64,
    ${csvUpperBytes}
  )`;
  const rows = await tx.$queryRawUnsafe<
    { id: string; serializedBytes: number }[]
  >(
    `SELECT export_row."id" AS "id",
            (${serializedBytes})::double precision AS "serializedBytes"
     FROM ${table} AS export_row
     ${joins}
     WHERE export_row.${scopeColumn} = $1
       AND ${cursorCondition}
     ORDER BY ${
       target.cursorOrder === "createdAt-id"
         ? 'export_row."createdAt" ASC, export_row."id" ASC'
         : 'export_row."id" ASC'
     }
     LIMIT $3`,
    organizationId,
    cursor ?? null,
    take,
  );
  if (
    rows.some(
      ({ serializedBytes: bytes }) =>
        !Number.isSafeInteger(bytes) ||
        bytes < 0 ||
        bytes > MAX_EXPORT_RECORD_BYTES,
    )
  ) {
    throw new ExportSizeLimitError();
  }
}

async function loadBoundedPage<T extends Row>(
  db: TenantDb,
  preflight: ExportPreflight | ExportPreflight[],
  organizationId: string,
  take: number,
  cursor: string | undefined,
  load: (tx: TenantTransaction) => Promise<T[]>,
) {
  return db.transaction(async (tx) => {
    for (const target of Array.isArray(preflight) ? preflight : [preflight]) {
      await assertPreflightRowsFit(tx, target, organizationId, take, cursor);
    }
    return load(tx);
  }, { isolationLevel: "RepeatableRead" });
}

async function writeChunk(
  stream: Writable,
  chunk: Uint8Array,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

class StagedFileWriter {
  private readonly buffer = Buffer.allocUnsafe(64 * 1024);
  private bufferedBytes = 0;
  private readonly encoder = new TextEncoder();

  constructor(private readonly file: FileHandle) {}

  async write(text: string) {
    let offset = 0;
    while (offset < text.length) {
      if (this.bufferedBytes === this.buffer.byteLength) {
        await this.flush();
      }
      const { read, written } = this.encoder.encodeInto(
        text.slice(offset),
        this.buffer.subarray(this.bufferedBytes),
      );
      if (read === 0 && written === 0) {
        await this.flush();
        continue;
      }
      offset += read;
      this.bufferedBytes += written;
      if (this.bufferedBytes === this.buffer.byteLength) {
        await this.flush();
      }
    }
  }

  async flush() {
    let offset = 0;
    while (offset < this.bufferedBytes) {
      const { bytesWritten } = await this.file.write(
        this.buffer,
        offset,
        this.bufferedBytes - offset,
        null,
      );
      if (bytesWritten === 0) {
        throw new Error("Export staging write made no progress");
      }
      offset += bytesWritten;
    }
    this.bufferedBytes = 0;
  }
}

class StreamingZipWriter {
  private readonly output;
  private readonly outputFinished;
  private outputQueue = Promise.resolve();
  private zipError: Error | undefined;
  private readonly zip: Zip;
  private archiveBytes = 0;

  constructor(
    filePath: string,
    private readonly signal?: AbortSignal,
  ) {
    this.output = createWriteStream(filePath, { highWaterMark: 64 * 1024 });
    this.outputFinished = finished(this.output);
    void this.outputFinished.catch(() => {});
    this.zip = new Zip((error, chunk) => {
      if (error) {
        this.zipError = error;
        return;
      }
      if (chunk?.byteLength) {
        if (chunk.byteLength > MAX_EXPORT_ARCHIVE_BYTES - this.archiveBytes) {
          this.zipError = new ExportSizeLimitError();
          return;
        }
        this.archiveBytes += chunk.byteLength;
        this.outputQueue = this.outputQueue.then(() =>
          writeChunk(this.output, chunk),
        );
      }
    });
  }

  private async flush() {
    const outputQueue = this.outputQueue;
    await outputQueue;
    this.outputQueue = Promise.resolve();
    if (this.zipError) throw this.zipError;
  }

  async addFile(
    name: string,
    filePath: string,
    signal?: AbortSignal,
  ) {
    throwIfAborted(signal);
    const entry = new ZipPassThrough(name);
    this.zip.add(entry);
    await this.flush();

    const input = await open(filePath, "r");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    try {
      while (true) {
        throwIfAborted(signal);
        const { bytesRead } = await input.read(
          buffer,
          0,
          buffer.byteLength,
          position,
        );
        if (bytesRead === 0) break;
        position += bytesRead;
        entry.push(buffer.subarray(0, bytesRead), false);
        await this.flush();
      }
      entry.push(new Uint8Array(0), true);
      await this.flush();
    } finally {
      await input.close();
    }
  }

  async finish() {
    throwIfAborted(this.signal);
    this.zip.end();
    await this.flush();
    this.output.end();
    await this.outputFinished;
  }

  async abort(error: Error) {
    this.zip.terminate();
    this.output.destroy(error);
    await this.outputFinished.catch(() => {});
  }
}

export type TenantExportArtifact = {
  path: string;
  size: number;
  cleanup: () => Promise<void>;
};

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error("Export operation was aborted");
}

/**
 * Builds a ZIP with every row the organization owns (CSV + JSON per table),
 * the uploaded files and a manifest. Reads go through the tenant client, so
 * row-level security confines the export to `organizationId` even if a filter is wrong.
 */
export async function buildTenantExport(
  db: TenantDb,
  organizationId: string,
  options: { signal?: AbortSignal; leaseId?: string } = {},
) {
  const { signal } = options;
  throwIfAborted(signal);
  // `deletedAt: undefined` opts out of the soft-delete filter so trashed rows are exported too.
  const scope = { organizationId, deletedAt: undefined };
  const own = { organizationId };
  const tempDir = options.leaseId
    ? path.join(
        os.tmpdir(),
        `tenant-export-${Buffer.from(organizationId).toString("base64url")}-${options.leaseId}`,
      )
    : await mkdtemp(path.join(os.tmpdir(), "tenant-export-"));
  let ownsTempDir = !options.leaseId;
  if (options.leaseId) {
    await mkdir(tempDir);
    ownsTempDir = true;
  }
  const stagingDir = path.join(tempDir, "entries");
  const zipPath = path.join(tempDir, "export.zip");
  try {
    await mkdir(stagingDir, { recursive: true });
  } catch (error) {
    if (ownsTempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
  const zip = new StreamingZipWriter(zipPath, signal);
  try {
  const rowCounts: Record<string, number> = {};
  const stagedAttachments: { name: string; path: string }[] = [];
  let totalRows = 0;
  let archiveInputBytes = 0;

  const addTable = async <T extends Row>(
    { name, preflight, load }: TableSource<T>,
    onRow?: (row: T) => Promise<void>,
    exportRow: (row: T) => Row = (row) => row,
  ) => {
    const jsonPath = path.join(stagingDir, `${name}.json`);
    const csvPath = path.join(stagingDir, `${name}.csv`);
    const jsonOutput = await open(jsonPath, "w");
    const csvOutput = await open(csvPath, "w").catch(async (error: unknown) => {
      await jsonOutput.close();
      throw error;
    });
    const jsonWriter = new StagedFileWriter(jsonOutput);
    const csvWriter = new StagedFileWriter(csvOutput);
    let rowCount = 0;
    let cursor: string | undefined;
    let csvHeader: string[] | undefined;

    const append = async (writer: StagedFileWriter, text: string) => {
      const byteLength = Buffer.byteLength(text);
      if (byteLength > MAX_EXPORT_ARCHIVE_INPUT_BYTES - archiveInputBytes) {
        throw new ExportSizeLimitError();
      }
      archiveInputBytes += byteLength;
      await writer.write(text);
    };

    try {
      await append(jsonWriter, "[\n");
      while (true) {
        throwIfAborted(signal);
        const remainingRows = MAX_EXPORT_ROWS - totalRows;
        const take = Math.min(MAX_EXPORT_QUERY_BATCH_SIZE, remainingRows + 1);
        const rows = await loadBoundedPage(
          db,
          preflight,
          organizationId,
          take,
          cursor,
          (tx) => load(tx, take, cursor),
        );
        if (rows.length > remainingRows) throw new ExportSizeLimitError();
        if (rows.length === 0) break;

        for (const row of rows) {
          throwIfAborted(signal);
          const outputRow = exportRow(row);
          const serialized = JSON.stringify(outputRow, null, 2);
          if (serialized === undefined) {
            throw new Error("Export row could not be serialized as JSON");
          }
          const formattedRow = serialized.replaceAll("\n", "\n  ");
          if (Buffer.byteLength(formattedRow) > MAX_EXPORT_RECORD_BYTES) {
            throw new ExportSizeLimitError();
          }
          if (rowCount > 0) await append(jsonWriter, ",\n");
          await append(jsonWriter, `  ${formattedRow}`);

          if (csvHeader === undefined) {
            csvHeader = Object.keys(outputRow);
            await append(csvWriter, `${csvHeader.join(",")}\r\n`);
          } else {
            await append(csvWriter, "\r\n");
          }
          const csvRow = csvHeader
            .map((column) => csvCell(Reflect.get(outputRow, column)))
            .join(",");
          if (Buffer.byteLength(csvRow) > MAX_EXPORT_RECORD_BYTES) {
            throw new ExportSizeLimitError();
          }
          await append(csvWriter, csvRow);

          rowCount += 1;
          totalRows += 1;
          await onRow?.(row);
        }

        cursor = rowId(rows[rows.length - 1]);
        if (rows.length < take) break;
      }
      if (rowCount > 0) await append(jsonWriter, "\n");
      await append(jsonWriter, "]");
      await Promise.all([jsonWriter.flush(), csvWriter.flush()]);
      rowCounts[name] = rowCount;
    } finally {
      await Promise.all([jsonOutput.close(), csvOutput.close()]);
    }
    await zip.addFile(`data/${name}.json`, jsonPath, signal);
    await zip.addFile(`data/${name}.csv`, csvPath, signal);
    await Promise.all([rm(jsonPath, { force: true }), rm(csvPath, { force: true })]);
  };

  const sources: TableSource[] = [
    {
      name: "sites",
      preflight: { tableName: "Site" },
      load: (tx, take, cursor) =>
        tx.site.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "sections",
      preflight: { tableName: "Section" },
      load: (tx, take, cursor) =>
        tx.section.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "equipment",
      preflight: { tableName: "Equipment" },
      load: (tx, take, cursor) =>
        tx.equipment.findMany({
          where: scope,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "equipment_relocations",
      preflight: { tableName: "EquipmentRelocation" },
      load: (tx, take, cursor) =>
        tx.equipmentRelocation.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "maintenance_tasks",
      preflight: { tableName: "MaintenanceTask" },
      load: (tx, take, cursor) =>
        tx.maintenanceTask.findMany({
          where: scope,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "maintenance_points",
      preflight: { tableName: "EquipmentMaintenancePoint" },
      load: (tx, take, cursor) =>
        tx.equipmentMaintenancePoint.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "equipment_point_checklist_items",
      preflight: { tableName: "EquipmentPointChecklistItem" },
      load: (tx, take, cursor) =>
        tx.equipmentPointChecklistItem.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "task_checklist_items",
      preflight: { tableName: "MaintenanceTaskChecklistItem" },
      load: (tx, take, cursor) =>
        tx.maintenanceTaskChecklistItem.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "equipment_operating_hour_readings",
      preflight: { tableName: "EquipmentOperatingHourReading" },
      load: (tx, take, cursor) =>
        tx.equipmentOperatingHourReading.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "materials",
      preflight: { tableName: "Material" },
      load: (tx, take, cursor) =>
        tx.material.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "inventory_items",
      preflight: { tableName: "InventoryItem" },
      load: (tx, take, cursor) =>
        tx.inventoryItem.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "inventory_movements",
      preflight: { tableName: "InventoryMovement" },
      load: (tx, take, cursor) =>
        tx.inventoryMovement.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "maintenance_task_reminders",
      preflight: { tableName: "MaintenanceTaskReminder" },
      load: (tx, take, cursor) =>
        tx.maintenanceTaskReminder.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "task_assignments",
      preflight: { tableName: "MaintenanceTaskAssignment" },
      load: (tx, take, cursor) =>
        tx.maintenanceTaskAssignment.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "daily_worker_hours",
      preflight: { tableName: "MaintenanceTaskDailyHours" },
      load: (tx, take, cursor) =>
        tx.maintenanceTaskDailyHours.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "workers",
      preflight: { tableName: "Worker" },
      load: (tx, take, cursor) =>
        tx.worker.findMany({
          where: scope,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "vendors",
      preflight: { tableName: "Vendor" },
      load: (tx, take, cursor) =>
        tx.vendor.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "members",
      preflight: { tableName: "member", joinUser: true },
      load: async (tx, take, cursor) => {
        const members = await tx.member.findMany({
          where: { organizationId },
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        return members.map(({ user, ...member }) => ({
          ...member,
          name: user.name,
          email: user.email,
        }));
      },
    },
    {
      name: "invitations",
      preflight: { tableName: "invitation" },
      load: (tx, take, cursor) =>
        tx.invitation.findMany({
          where: own,
          orderBy: { id: "asc" },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
    {
      name: "audit_events",
      preflight: {
        tableName: "organization_audit_event",
        cursorOrder: "createdAt-id",
      },
      load: (tx, take, cursor) =>
        tx.organizationAuditEvent.findMany({
          where: { organizationId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
    },
  ];

  // The company profile; lifecycle state and internal flags are not customer data.
  await addTable({
    name: "organization",
    preflight: {
      tableName: "organization",
      scopeColumn: "id",
      organizationProfile: true,
    },
    load: async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          metadata: true,
          createdAt: true,
        },
      });
      const profile = await tx.tenantSettings.findUnique({
        where: { organizationId },
        select: {
          contactEmail: true,
          contactPhone: true,
          timezone: true,
          locale: true,
          logoFileId: true,
        },
      });
      return organization ? [{ ...organization, ...profile }] : [];
    },
  });

  for (const source of sources) {
    await addTable(source);
  }

  const storage = getStorage();
  const missingFiles: string[] = [];
  const fileSource: TableSource<{
    id: string;
    key: string;
    filename: string;
    size: number;
  }> = {
    name: "files",
    preflight: { tableName: "StoredFile" },
    load: (tx, take, cursor) =>
      tx.storedFile.findMany({
        where: own,
        orderBy: { id: "asc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
  };
  await addTable(
    fileSource,
    async (file) => {
      throwIfAborted(signal);
      if (!Number.isSafeInteger(file.size) || file.size < 0) {
        throw new StorageObjectIntegrityError(
          "Stored file metadata has an invalid size",
        );
      }
      if (file.size > MAX_EXPORT_ATTACHMENT_BYTES) {
        throw new ExportSizeLimitError();
      }
      if (file.size > MAX_EXPORT_ARCHIVE_INPUT_BYTES - archiveInputBytes) {
        throw new ExportSizeLimitError();
      }
      const object = await storage.getStream(file.key, signal);
      if (!object) {
        missingFiles.push(file.id);
        return;
      }
      const remainingBytes =
        MAX_EXPORT_ARCHIVE_INPUT_BYTES - archiveInputBytes;
      const actualByteLimit = Math.min(
        MAX_EXPORT_ATTACHMENT_BYTES,
        remainingBytes,
      );
      if (
        object.contentLength !== null &&
        (object.contentLength > MAX_EXPORT_ATTACHMENT_BYTES ||
          object.contentLength > remainingBytes)
      ) {
        object.body.destroy();
        throw new ExportSizeLimitError();
      }
      if (
        object.contentLength !== null &&
        object.contentLength !== file.size
      ) {
        object.body.destroy();
        throw new StorageObjectIntegrityError(
          "Stored object size does not match its database metadata",
        );
      }
      const attachmentName = `files/${file.id}-${safeName(file.filename)}`;
      const attachmentPath = path.join(
        stagingDir,
        `${safeName(file.id)}.attachment`,
      );
      let actualBytes = 0;
      const sizeGuard = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          actualBytes += chunk.byteLength;
          if (actualBytes > actualByteLimit) {
            callback(new ExportSizeLimitError());
            return;
          }
          if (actualBytes > file.size) {
            callback(
              new StorageObjectIntegrityError(
                "Stored object exceeds its database metadata size",
              ),
            );
            return;
          }
          callback(null, chunk);
        },
      });
      try {
        await pipeline(
          object.body,
          sizeGuard,
          createWriteStream(attachmentPath, {
            flags: "wx",
            highWaterMark: 64 * 1024,
          }),
          { signal },
        );
        if (actualBytes !== file.size) {
          throw new StorageObjectIntegrityError(
            "Stored object size does not match its database metadata",
          );
        }
      } catch (error) {
        object.body.destroy();
        await rm(attachmentPath, { force: true });
        throw error;
      }
      archiveInputBytes += actualBytes;
      stagedAttachments.push({ name: attachmentName, path: attachmentPath });
    },
    (row) =>
      Object.fromEntries(
        Object.entries(row).filter(([name]) => name !== "key"),
      ),
  );

  const manifest = strToU8(
    JSON.stringify(
      {
        formatVersion: EXPORT_FORMAT_VERSION,
        organizationId,
        generatedAt: new Date().toISOString(),
        rowCounts,
        files: {
          included: (rowCounts.files ?? 0) - missingFiles.length,
          missing: missingFiles,
        },
        notes:
          "Rows with a deletedAt value were in the trash when exported. Files are named <file id>-<filename>; tables reference files by id.",
      },
      null,
      2,
    ),
  );
  if (manifest.byteLength > MAX_EXPORT_ARCHIVE_INPUT_BYTES - archiveInputBytes) {
    throw new ExportSizeLimitError();
  }
  archiveInputBytes += manifest.byteLength;
  const manifestPath = path.join(stagingDir, "manifest.json");
  await writeFile(manifestPath, manifest);
  await zip.addFile("manifest.json", manifestPath, signal);
  for (const attachment of stagedAttachments) {
    await zip.addFile(attachment.name, attachment.path, signal);
  }
  await zip.finish();
  const { size } = await stat(zipPath);
  let cleaned = false;
  return {
    path: zipPath,
    size,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await rm(tempDir, { recursive: true, force: true });
    },
  };
  } catch (error) {
    await zip.abort(
      error instanceof Error ? error : new Error("Export generation failed"),
    );
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}
