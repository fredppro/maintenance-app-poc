import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getTenantContext: vi.fn(),
  recordAuditEvent: vi.fn(),
  getStream: vi.fn(),
}));

vi.mock("@/lib/tenant-context", () => ({
  getTenantContext: mocks.getTenantContext,
}));
vi.mock("@/lib/audit", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ getStream: mocks.getStream }),
}));

import { GET } from "./route";

const record = {
  id: "export-1",
  organizationId: "org-1",
  fileKey: "exports/org-1/export-1.zip",
  size: 3,
};

function request() {
  return new Request("https://example.test/api/exports/export-1");
}

describe("export download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenantContext.mockResolvedValue({
      organizationId: "org-1",
      userId: "user-1",
      db: { tenantExport: { findFirst: mocks.findFirst } },
    });
    mocks.findFirst.mockResolvedValue(record);
    mocks.getStream.mockResolvedValue({
      body: Readable.from([Buffer.from("zip")]),
      contentType: "application/zip",
      contentLength: 3,
    });
    mocks.recordAuditEvent.mockResolvedValue(undefined);
  });

  it("streams a download with the existing headers", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ id: "export-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="export-export-1.zip"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("zip"));
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "export-1",
        organizationId: "org-1",
        status: "READY",
        expiresAt: { gt: expect.any(Date) },
      },
    });
  });

  it("streams large downloads incrementally", async () => {
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    async function* chunks() {
      for (let index = 0; index < 128; index += 1) yield chunk;
    }
    mocks.findFirst.mockResolvedValue({ ...record, size: chunk.byteLength * 128 });
    mocks.getStream.mockResolvedValue({
      body: Readable.from(chunks()),
      contentType: "application/zip",
      contentLength: chunk.byteLength * 128,
    });
    const response = await GET(request(), {
      params: Promise.resolve({ id: "export-1" }),
    });

    let received = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected a streamed response body");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
    }
    expect(received).toBe(chunk.byteLength * 128);
  });

  it("releases the object stream when the client cancels", async () => {
    const body = Readable.from(
      (async function* () {
        while (true) yield Buffer.alloc(64 * 1024);
      })(),
    );
    mocks.getStream.mockResolvedValue({
      body,
      contentType: "application/zip",
      contentLength: 1024 * 1024,
    });
    const response = await GET(request(), {
      params: Promise.resolve({ id: "export-1" }),
    });
    await response.body?.cancel();
    expect(body.destroyed).toBe(true);
  });

  it("returns not found when the export object is missing", async () => {
    mocks.getStream.mockResolvedValue(null);
    const response = await GET(request(), {
      params: Promise.resolve({ id: "export-1" }),
    });
    expect(response.status).toBe(404);
  });

  it("does not fetch an object for an unauthorized caller", async () => {
    mocks.getTenantContext.mockRejectedValue(new Error("forbidden"));
    const response = await GET(request(), {
      params: Promise.resolve({ id: "export-1" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.getStream).not.toHaveBeenCalled();
  });

  it("scopes export lookup to the caller's organization", async () => {
    mocks.getTenantContext.mockResolvedValue({
      organizationId: "org-other",
      userId: "user-2",
      db: { tenantExport: { findFirst: mocks.findFirst } },
    });
    mocks.findFirst.mockResolvedValue(null);
    const response = await GET(request(), {
      params: Promise.resolve({ id: "export-1" }),
    });
    expect(response.status).toBe(404);
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-other" }),
      }),
    );
    expect(mocks.getStream).not.toHaveBeenCalled();
  });

  it("rejects archive size mismatches before returning a stream", async () => {
    mocks.getStream.mockResolvedValue({
      body: Readable.from([Buffer.from("zip")]),
      contentType: "application/zip",
      contentLength: 4,
    });
    const response = await GET(request(), {
      params: Promise.resolve({ id: "export-1" }),
    });
    expect(response.status).toBe(502);
  });

  it("propagates storage failures", async () => {
    mocks.getStream.mockRejectedValue(new Error("storage unavailable"));
    await expect(
      GET(request(), { params: Promise.resolve({ id: "export-1" }) }),
    ).rejects.toThrow("storage unavailable");
  });

  it("propagates errors that occur during streamed reads", async () => {
    const body = Readable.from(
      (async function* () {
        yield Buffer.from("partial");
        throw new Error("stream failed");
      })(),
    );
    mocks.findFirst.mockResolvedValue({ ...record, size: null });
    mocks.getStream.mockResolvedValue({
      body,
      contentType: "application/zip",
      contentLength: null,
    });
    const response = await GET(request(), {
      params: Promise.resolve({ id: "export-1" }),
    });
    await expect(response.arrayBuffer()).rejects.toThrow("stream failed");
  });
});
