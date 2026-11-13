import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import {
  getTenantContext,
  PermissionDeniedError,
} from "@/lib/tenant-context";

const dbMocks = vi.hoisted(() => ({
  taskFindFirst: vi.fn(),
  reminderFindMany: vi.fn(),
}));

vi.mock("@/lib/tenant-context", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  OrganizationRequiredError: class OrganizationRequiredError extends Error {},
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  SiteSelectionRequiredError: class SiteSelectionRequiredError extends Error {},
  SiteSetupRequiredError: class SiteSetupRequiredError extends Error {},
  TenantInactiveError: class TenantInactiveError extends Error {},
  getTenantContext: vi.fn(),
}));

function createTenantDb() {
  return {
    maintenanceTask: { findFirst: dbMocks.taskFindFirst },
    maintenanceTaskReminder: {
      findMany: dbMocks.reminderFindMany,
    },
  };
}

describe("GET /api/tasks/[id]/notifications", () => {
  beforeEach(() => {
    dbMocks.taskFindFirst.mockReset().mockResolvedValue({ id: "task-1" });
    dbMocks.reminderFindMany.mockReset().mockResolvedValue([]);
    vi.mocked(getTenantContext).mockReset().mockResolvedValue({
      db: createTenantDb(),
      organizationId: "org-1",
      siteId: "site-1",
      userId: "user-1",
      role: "owner",
    } as never);
  });

  it("returns a tenant- and site-scoped page without caching it", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/tasks/task-1/notifications"),
      { params: Promise.resolve({ id: "task-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getTenantContext).toHaveBeenCalledWith("viewMaintenance");
    expect(dbMocks.taskFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          equipment: { is: { siteId: "site-1" } },
        }),
      }),
    );
    expect(await response.json()).toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it("rejects malformed cursors before querying tenant data", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/tasks/task-1/notifications?cursor=not-a-cursor",
      ),
      { params: Promise.resolve({ id: "task-1" }) },
    );

    expect(response.status).toBe(400);
    expect(getTenantContext).not.toHaveBeenCalled();
  });

  it("accepts a timestamp-and-id cursor for the next page", async () => {
    const cursor = `${new Date("2026-11-08T17:00:00.000Z").toISOString()}|notice-5`;
    const response = await GET(
      new NextRequest(
        `http://localhost/api/tasks/task-1/notifications?cursor=${encodeURIComponent(cursor)}`,
      ),
      { params: Promise.resolve({ id: "task-1" }) },
    );

    expect(response.status).toBe(200);
    expect(dbMocks.reminderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskId: "task-1",
          organizationId: "org-1",
          OR: [
            { createdAt: { lt: new Date("2026-11-08T17:00:00.000Z") } },
            {
              createdAt: new Date("2026-11-08T17:00:00.000Z"),
              id: { lt: "notice-5" },
            },
          ],
        },
      }),
    );
  });

  it("maps missing maintenance permission to a forbidden response", async () => {
    vi.mocked(getTenantContext).mockRejectedValueOnce(
      new PermissionDeniedError("viewMaintenance"),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/tasks/task-1/notifications"),
      { params: Promise.resolve({ id: "task-1" }) },
    );

    expect(response.status).toBe(403);
  });
});
