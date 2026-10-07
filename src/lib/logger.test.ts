import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "./logger";

describe("logEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits structured JSON and redacts secrets and connection strings", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logEvent("error", "boom", {
      organizationId: "org-1",
      password: "hunter2",
      nested: { authToken: "abc" },
      error: new Error("failed to connect postgresql://user:pw@host/db"),
    });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", event: "boom", organizationId: "org-1", password: "[redacted]" });
    expect(line.nested.authToken).toBe("[redacted]");
    expect(JSON.stringify(line)).not.toContain("hunter2");
    expect(JSON.stringify(line)).not.toContain("user:pw");
  });
});
