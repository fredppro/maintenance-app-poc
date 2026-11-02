import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchMaintenanceReminders: vi.fn(),
  forTenant: vi.fn(),
  organizationFindMany: vi.fn(),
}));

vi.mock("@/features/scheduler/server/reminders", () => ({
  dispatchMaintenanceReminders: mocks.dispatchMaintenanceReminders,
}));
vi.mock("@/lib/prisma", () => ({
  forTenant: mocks.forTenant,
  default: {
    organization: { findMany: mocks.organizationFindMany },
  },
}));

import { POST } from "./route";

describe("maintenance reminder cron route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not dispatch reminders for inactive organizations", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    mocks.organizationFindMany.mockResolvedValue([{ id: "org-suspended" }]);
    mocks.forTenant.mockReturnValue({
      tenantSettings: {
        findUnique: vi.fn().mockResolvedValue({
          status: "SUSPENDED",
          isolationTier: "POOLED",
        }),
      },
    });
    const response = await POST(new Request("http://localhost/api/cron/maintenance-reminders", {
      method: "POST",
      headers: { authorization: "Bearer expected-secret" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.dispatchMaintenanceReminders).not.toHaveBeenCalled();
  });

  it("fails closed when the cron secret is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await POST(new Request("http://localhost/api/cron/maintenance-reminders", {
      method: "POST",
    }));

    expect(response.status).toBe(503);
    expect(mocks.organizationFindMany).not.toHaveBeenCalled();
  });

  it("rejects a missing or incorrect bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    const response = await POST(new Request("http://localhost/api/cron/maintenance-reminders", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    }));

    expect(response.status).toBe(401);
    expect(mocks.organizationFindMany).not.toHaveBeenCalled();
  });

  it("dispatches for active pooled organizations and returns aggregate counts", async () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    mocks.organizationFindMany.mockResolvedValue([{ id: "org-1" }, { id: "org-2" }]);
    mocks.forTenant.mockReturnValue({
      tenantSettings: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });
    mocks.dispatchMaintenanceReminders
      .mockResolvedValueOnce({ cancelled: 1, failed: 0, sent: 2, skipped: 0 })
      .mockResolvedValueOnce({ cancelled: 0, failed: 1, sent: 0, skipped: 1 });
    const response = await POST(new Request("http://localhost/api/cron/maintenance-reminders", {
      method: "POST",
      headers: { authorization: "Bearer expected-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cancelled: 1,
      failed: 1,
      sent: 2,
      skipped: 1,
      organizationFailures: 0,
    });
    expect(mocks.organizationFindMany).toHaveBeenCalledOnce();
    expect(mocks.dispatchMaintenanceReminders).toHaveBeenCalledTimes(2);
  });
});
