import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/notify", () => {
  it("does not claim success when notification delivery is not configured", async () => {
    const request = new Request("http://localhost:3000/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: { id: "task-1", title: "Emergency Repair" },
        worker: { id: "worker-1", email: "tech@company.com" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(501);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.message).toBe("Notification delivery is not configured");
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request("http://localhost:3000/api/notify", {
      method: "POST",
      body: "invalid-json-body",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.message).toBe("Invalid JSON request body");
  });

  it("returns 400 when recipient or task fields are invalid", async () => {
    const request = new Request("http://localhost:3000/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: { id: "task-1", title: "Repair" },
        worker: { id: "worker-1", email: "not-an-email" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      message: "Invalid notification request",
    });
  });
});
