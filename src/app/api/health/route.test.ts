import { describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports readiness when PostgreSQL is reachable", async () => {
    const queryMock = vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ "?column?": 1 }] as never);

    try {
      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      queryMock.mockRestore();
    }
  });

  it("does not expose database errors when PostgreSQL is unavailable", async () => {
    const queryMock = vi
      .spyOn(prisma, "$queryRaw")
      .mockRejectedValue(new Error("database-secret-detail"));
    const errorMock = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "unavailable" });
      expect(errorMock).toHaveBeenCalledWith(
        expect.not.stringContaining("database-secret-detail"),
      );
    } finally {
      queryMock.mockRestore();
      errorMock.mockRestore();
    }
  });

  it("does not report production readiness without mail configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("AUTH_EMAIL_FROM", "");

    try {
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "unavailable" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("requires the bootstrap email until a non-legacy organization exists", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "configured");
    vi.stubEnv("AUTH_EMAIL_FROM", "Maintenance Scheduler <accounts@example.com>");
    vi.stubEnv("PILOT_BOOTSTRAP_EMAIL", "");
    const queryMock = vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ "?column?": 1 }] as never);
    const countMock = vi.spyOn(prisma.organization, "count").mockResolvedValue(0);

    try {
      const response = await GET();
      expect(response.status).toBe(503);
      expect(countMock).toHaveBeenCalledWith({
        where: { slug: { not: "legacy-workspace" } },
      });
      expect(await response.json()).toEqual({ status: "unavailable" });
    } finally {
      queryMock.mockRestore();
      countMock.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
