import { beforeEach, describe, expect, it, vi } from "vitest";
import { takeRateLimit } from "./rate-limit";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ default: { $queryRaw: queryRaw } }));

describe("takeRateLimit", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("allows requests up to the limit and blocks beyond it", async () => {
    const options = { limit: 2, windowSeconds: 60 };
    queryRaw.mockResolvedValueOnce([{ count: 2 }]);
    expect((await takeRateLimit("upload", "u1", options)).allowed).toBe(true);
    queryRaw.mockResolvedValueOnce([{ count: 3 }]);
    expect((await takeRateLimit("upload", "u1", options)).allowed).toBe(false);
  });

  it("fails open when the limiter store is unavailable", async () => {
    queryRaw.mockRejectedValueOnce(new Error("db down"));
    expect((await takeRateLimit("upload", "u1", { limit: 1, windowSeconds: 60 })).allowed).toBe(true);
  });
});
