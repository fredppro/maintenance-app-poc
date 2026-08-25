import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { POST } from "./route";

describe("POST /api/notify", () => {
  test("processes notification request and returns recipient", async () => {
    const request = new Request("http://localhost:3000/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: { id: "task-1", title: "Emergency Repair" },
        worker: { id: "worker-1", email: "tech@company.com" },
      }),
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 200);

    const data = await response.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.message, "Notification sent successfully");
    assert.strictEqual(data.recipient, "tech@company.com");
  });

  test("handles invalid request bodies gracefully with 500 status", async () => {
    const request = new Request("http://localhost:3000/api/notify", {
      method: "POST",
      body: "invalid-json-body",
    });

    const response = await POST(request);
    assert.strictEqual(response.status, 500);

    const data = await response.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.message, "Failed to send notification");
  });
});
