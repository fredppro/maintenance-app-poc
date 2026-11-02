import { readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TenantDb } from "@/lib/prisma";
import {
  EXPORT_TEMP_RECLAIM_GRACE_MS,
  STALE_EXPORT_AFTER_MS,
} from "../export-policy";

type ReservationState = {
  leaseId: string;
  active: boolean;
};

const LEASE_ID =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export async function recoverStaleExportDirectories(
  db: TenantDb,
  organizationId: string,
) {
  const tmpDir = os.tmpdir();
  const tenantPrefix = `tenant-export-${Buffer.from(organizationId).toString("base64url")}-`;
  const cutoff =
    Date.now() - STALE_EXPORT_AFTER_MS - EXPORT_TEMP_RECLAIM_GRACE_MS;
  const candidates: { leaseId: string; directory: string }[] = [];

  for (const entry of await readdir(tmpDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(tenantPrefix)) continue;
    const match = LEASE_ID.exec(entry.name.slice(tenantPrefix.length));
    if (!match) continue;

    const directory = path.join(tmpDir, entry.name);
    let details: Awaited<ReturnType<typeof stat>>;
    try {
      details = await stat(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (details.mtimeMs <= cutoff) {
      candidates.push({ leaseId: match[1], directory });
    }
  }
  if (candidates.length === 0) return 0;

  const idParameters = candidates.map(
    (_, index) => `$${index + 2}::text`,
  );
  const rows = await db.transaction((tx) =>
    tx.$queryRawUnsafe<ReservationState[]>(
      `SELECT candidate.lease_id AS "leaseId",
              public.is_tenant_export_temp_active($1, candidate.lease_id) AS active
       FROM unnest(ARRAY[${idParameters.join(", ")}]) AS candidate(lease_id)`,
      organizationId,
      ...candidates.map(({ leaseId }) => leaseId),
    ),
  );
  const activeByLease = new Map(
    rows.map(({ leaseId, active }) => [leaseId, active]),
  );

  let removed = 0;
  for (const candidate of candidates) {
    if (activeByLease.get(candidate.leaseId) !== false) continue;
    await rm(candidate.directory, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}
