import { describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  verification: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  invitation: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  rateLimit: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
  tenantExport: {
    findMany: vi.fn().mockResolvedValue([{ id: "e1", fileKey: "exports/o/e1.zip" }]),
    delete: vi.fn(),
  },
}));
const storage = vi.hoisted(() => ({ delete: vi.fn() }));
vi.mock("../../prisma/seed-env", () => ({}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/storage", () => ({ getStorage: () => storage }));

import { runRetention } from "../../scripts/ops/retention";

describe("runRetention", () => {
  it("removes stale operational data and expired export archives, never audit events", async () => {
    const result = await runRetention(new Date("2026-10-10T00:00:00Z"));
    expect(result).toEqual({ sessions: 2, verifications: 1, invitations: 0, rateLimits: 3, exports: 1 });
    expect(storage.delete).toHaveBeenCalledWith("exports/o/e1.zip");
    expect(prismaMock.tenantExport.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
  });
});
