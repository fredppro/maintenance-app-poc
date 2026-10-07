import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { getTenantContext, saveImageFile, takeRateLimit } = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  takeRateLimit: vi.fn(),
  saveImageFile: vi.fn(),
}));
vi.mock("@/lib/tenant-context", () => ({ getTenantContext }));
vi.mock("@/lib/rate-limit", () => ({ takeRateLimit }));
vi.mock("@/features/files/server/files", async () => {
  class FileValidationError extends Error {}
  return { saveImageFile, FileValidationError, MAX_FILE_BYTES: 5 * 1024 * 1024 };
});

function upload(body?: FormData, headers: Record<string, string> = {}) {
  // jsdom's File differs from undici's, so hand the route a stub request.
  return POST({
    headers: new Headers(headers),
    formData: async () => {
      if (!body) throw new Error("no body");
      return body;
    },
  } as unknown as Request);
}
const formWith = (file: File | string) => {
  const form = new FormData();
  form.set("file", file);
  return form;
};

describe("POST /api/files", () => {
  beforeEach(() => {
    getTenantContext.mockReset().mockResolvedValue({ organizationId: "org-1", userId: "u-1" });
    saveImageFile.mockReset();
    takeRateLimit.mockReset().mockResolvedValue({ allowed: true });
  });

  it("rejects uploads over the rate limit", async () => {
    takeRateLimit.mockResolvedValue({ allowed: false });
    const response = await upload(formWith(new File(["x"], "a.png")));
    expect(response.status).toBe(429);
    expect(saveImageFile).not.toHaveBeenCalled();
  });

  it("requires maintenance write permission", async () => {
    getTenantContext.mockRejectedValue(new Error("forbidden"));
    const response = await upload(formWith(new File(["x"], "a.png")));
    expect(response.status).toBe(403);
    expect(getTenantContext).toHaveBeenCalledWith("manageMaintenance");
    expect(saveImageFile).not.toHaveBeenCalled();
  });

  it("rejects bodies declared larger than the limit", async () => {
    const response = await upload(formWith(new File(["x"], "a.png")), {
      "content-length": String(50 * 1024 * 1024),
    });
    expect(response.status).toBe(413);
  });

  it("rejects requests without a file part", async () => {
    expect((await upload(formWith("not a file"))).status).toBe(400);
  });

  it("stores the file for the active organization and returns its id", async () => {
    saveImageFile.mockResolvedValue({ id: "f-1" });
    const response = await upload(formWith(new File(["abc"], "pump.png", { type: "image/png" })));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "f-1" });
    expect(saveImageFile).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", userId: "u-1", filename: "pump.png" }),
    );
  });

  it("maps validation failures to 400 and storage failures to 500", async () => {
    const { FileValidationError } = await import("@/features/files/server/files");
    saveImageFile.mockRejectedValueOnce(new FileValidationError("bad"));
    expect((await upload(formWith(new File(["x"], "a.png")))).status).toBe(400);

    vi.spyOn(console, "error").mockImplementation(() => {});
    saveImageFile.mockRejectedValueOnce(new Error("s3 down"));
    expect((await upload(formWith(new File(["x"], "a.png")))).status).toBe(500);
  });
});
