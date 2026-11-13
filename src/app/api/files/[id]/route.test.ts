import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionDeniedError } from "@/lib/tenant-context";
import { GET } from "./route";

const { getTenantContext, readStoredFile, tenantErrors } = vi.hoisted(() => {
  class AuthenticationRequiredError extends Error {}
  class OrganizationRequiredError extends Error {}
  class PermissionDeniedError extends Error {}
  class SiteSelectionRequiredError extends Error {}
  class SiteSetupRequiredError extends Error {}
  class TenantInactiveError extends Error {}

  return {
    getTenantContext: vi.fn(),
    readStoredFile: vi.fn(),
    tenantErrors: {
      AuthenticationRequiredError,
      OrganizationRequiredError,
      PermissionDeniedError,
      SiteSelectionRequiredError,
      SiteSetupRequiredError,
      TenantInactiveError,
    },
  };
});
vi.mock("@/lib/tenant-context", () => ({
  getTenantContext,
  ...tenantErrors,
}));
vi.mock("@/features/files/server/files", () => ({ readStoredFile }));

const call = () => GET(new Request("http://x"), { params: Promise.resolve({ id: "f-1" }) });

describe("GET /api/files/[id]", () => {
  beforeEach(() => {
    getTenantContext.mockReset().mockResolvedValue({ organizationId: "org-1", db: "tenant-db" });
    readStoredFile.mockReset();
  });

  it("rejects callers without access", async () => {
    getTenantContext.mockRejectedValue(
      new PermissionDeniedError("viewMaintenance"),
    );
    expect((await call()).status).toBe(403);
  });

  it("preserves unexpected tenant lookup failures", async () => {
    const error = new Error("database unavailable");
    getTenantContext.mockRejectedValue(error);
    await expect(call()).rejects.toBe(error);
  });

  it("returns 404 for files outside the caller's organization", async () => {
    readStoredFile.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(readStoredFile).toHaveBeenCalledWith("tenant-db", "f-1", "org-1");
  });

  it("serves the bytes with safe, private headers", async () => {
    readStoredFile.mockResolvedValue({
      file: { contentType: "image/png", size: 3 },
      object: { body: Buffer.from("abc") },
    });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("abc");
  });
});
