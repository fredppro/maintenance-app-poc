import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { getTenantContext, readStoredFile } = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  readStoredFile: vi.fn(),
}));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext }));
vi.mock("@/features/files/server/files", () => ({ readStoredFile }));

const call = () => GET(new Request("http://x"), { params: Promise.resolve({ id: "f-1" }) });

describe("GET /api/files/[id]", () => {
  beforeEach(() => {
    getTenantContext.mockReset().mockResolvedValue({ organizationId: "org-1" });
    readStoredFile.mockReset();
  });

  it("rejects callers without access", async () => {
    getTenantContext.mockRejectedValue(new Error("nope"));
    expect((await call()).status).toBe(403);
  });

  it("returns 404 for files outside the caller's organization", async () => {
    readStoredFile.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(readStoredFile).toHaveBeenCalledWith("f-1", "org-1");
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
