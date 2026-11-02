import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  findFirst: vi.fn(),
  getTenantContext: vi.fn(),
  recordAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
  runTenantExport: vi.fn(),
  takeRateLimit: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/rate-limit", () => ({ takeRateLimit: mocks.takeRateLimit }));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext: mocks.getTenantContext }));
vi.mock("./run-export", () => ({ runTenantExport: mocks.runTenantExport }));

import { requestTenantExport } from "./actions";

describe("requestTenantExport recovery", () => {
  const db = {
    tenantExport: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      create: vi.fn(),
    },
  };
  const now = new Date("2026-11-02T10:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.getTenantContext.mockResolvedValue({
      db,
      organizationId: "org-1",
      userId: "user-1",
    });
    mocks.after.mockImplementation((callback: () => Promise<void>) => callback);
  });

  it("reschedules an existing pending export", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "export-1",
      status: "PENDING",
      heartbeatAt: null,
    });

    await expect(requestTenantExport()).resolves.toEqual({ id: "export-1" });

    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("reclaims and reschedules an export with a stale heartbeat", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "export-1",
      status: "RUNNING",
      heartbeatAt: new Date(now.getTime() - 3 * 60 * 1000),
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(requestTenantExport()).resolves.toEqual({ id: "export-1" });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "export-1",
        organizationId: "org-1",
        status: "RUNNING",
        heartbeatAt: { lte: new Date(now.getTime() - 2 * 60 * 1000) },
      },
      data: {
        status: "PENDING",
        leaseId: null,
        heartbeatAt: null,
        error: null,
      },
    });
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it("leaves a recently heartbeating export alone", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "export-1",
      status: "RUNNING",
      heartbeatAt: new Date(now.getTime() - 30 * 1000),
    });

    await expect(requestTenantExport()).resolves.toEqual({ id: "export-1" });

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
