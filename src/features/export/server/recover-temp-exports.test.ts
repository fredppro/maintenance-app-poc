import { mkdir, readdir, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPORT_TEMP_RECLAIM_GRACE_MS,
  STALE_EXPORT_AFTER_MS,
} from "../export-policy";
import { recoverStaleExportDirectories } from "./recover-temp-exports";

const createdDirectories: string[] = [];

function directoryFor(leaseId: string, organizationId = "org-1") {
  const tenantPrefix = Buffer.from(organizationId).toString("base64url");
  const directory = path.join(
    os.tmpdir(),
    `tenant-export-${tenantPrefix}-${leaseId}`,
  );
  createdDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function dbWithReservationStates(states: Map<string, boolean>) {
  const query = vi.fn(
    async (_sql: string, ...parameters: unknown[]) =>
      (parameters.slice(1) as string[]).map((leaseId) => ({
        leaseId,
        active: states.get(leaseId) ?? false,
      })),
  );
  const tx = { $queryRawUnsafe: query };
  return {
    db: {
      transaction: (
        callback: (transaction: { $queryRawUnsafe: typeof query }) => Promise<unknown>,
      ) =>
        callback(tx),
    } as never,
    query,
  };
}

describe("recoverStaleExportDirectories", () => {
  it("preserves directories for active leases", async () => {
    const leaseId = "94f1e092-a374-42de-8047-40fc3a2f971a";
    const directory = directoryFor(leaseId);
    const otherTenantDirectory = directoryFor(
      "ab13bfa9-8e93-4564-9d8b-46c7ea20df08",
      "org-2",
    );
    await mkdir(directory);
    await mkdir(otherTenantDirectory);
    await utimes(directory, new Date(0), new Date(0));
    await utimes(otherTenantDirectory, new Date(0), new Date(0));
    const { db, query } = dbWithReservationStates(new Map([[leaseId, true]]));

    expect(await recoverStaleExportDirectories(db, "org-1")).toBe(0);
    expect(await readdir(directory)).toEqual([]);
    expect(await readdir(otherTenantDirectory)).toEqual([]);
    expect(query).toHaveBeenCalledOnce();
  });

  it("removes an expired directory idempotently after the lease grace period", async () => {
    const leaseId = "f6755375-8808-4efb-8603-3997c8f437e1";
    const directory = directoryFor(leaseId);
    await mkdir(directory);
    const stale = new Date(
      Date.now() - STALE_EXPORT_AFTER_MS - EXPORT_TEMP_RECLAIM_GRACE_MS - 1000,
    );
    await utimes(directory, stale, stale);
    const { db } = dbWithReservationStates(new Map());

    expect(await recoverStaleExportDirectories(db, "org-1")).toBe(1);
    expect(await recoverStaleExportDirectories(db, "org-1")).toBe(0);
  });

  it("does not query or remove directories inside the reclaim grace period", async () => {
    const leaseId = "d647a8f3-0ca4-46da-a04d-ffca18f707c2";
    const directory = directoryFor(leaseId);
    await mkdir(directory);
    const recent = new Date(Date.now() - STALE_EXPORT_AFTER_MS);
    await utimes(directory, recent, recent);
    const { db, query } = dbWithReservationStates(new Map());

    expect(await recoverStaleExportDirectories(db, "org-1")).toBe(0);
    expect(await readdir(directory)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
