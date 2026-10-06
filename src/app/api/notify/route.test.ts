import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/notify", () => {
  it("processes notification request and returns recipient", async () => {
    const request = new Request("http://localhost:3000/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: { id: "task-1", title: "Emergency Repair" },
        worker: { id: "worker-1", email: "tech@company.com" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Notification sent successfully");
    expect(data.recipient).toBe("tech@company.com");
  });

  it("handles invalid request bodies gracefully with 500 status", async () => {
    const request = new Request("http://localhost:3000/api/notify", {
      method: "POST",
      body: "invalid-json-body",
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.message).toBe("Failed to send notification");
  });
});
