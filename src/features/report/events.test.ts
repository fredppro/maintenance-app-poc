import assert from "node:assert/strict";
import test, { describe, beforeEach, afterEach } from "node:test";
import {
  notifyReportPreviewRefresh,
  subscribeToReportPreviewRefresh,
  REPORT_PREVIEW_EVENT,
} from "./events";

describe("report events", () => {
  let originalWindow: typeof globalThis.window;
  let originalBroadcastChannel: typeof globalThis.BroadcastChannel;

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
    originalBroadcastChannel = (globalThis as any).BroadcastChannel;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  });

  test("handles SSR environment gracefully when window is undefined", () => {
    delete (globalThis as any).window;
    delete (globalThis as any).BroadcastChannel;

    // Should not throw in SSR
    assert.doesNotThrow(() => notifyReportPreviewRefresh("task-123"));

    const unsubscribe = subscribeToReportPreviewRefresh(() => {});
    assert.strictEqual(typeof unsubscribe, "function");
    assert.doesNotThrow(() => unsubscribe());
  });

  test("notifies and receives events in the same tab via CustomEvent", () => {
    const listeners: Record<string, ((event: any) => void)[]> = {};

    class MockCustomEvent {
      type: string;
      detail: any;
      constructor(type: string, options: { detail: any }) {
        this.type = type;
        this.detail = options.detail;
      }
    }

    (globalThis as any).CustomEvent = MockCustomEvent;
    (globalThis as any).window = {
      addEventListener(type: string, fn: (event: any) => void) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener(type: string, fn: (event: any) => void) {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((l) => l !== fn);
        }
      },
      dispatchEvent(event: any) {
        (listeners[event.type] || []).forEach((fn) => fn(event));
      },
    };
    delete (globalThis as any).BroadcastChannel;

    const receivedTaskIds: string[] = [];
    const unsubscribe = subscribeToReportPreviewRefresh((taskId) => {
      receivedTaskIds.push(taskId);
    });

    notifyReportPreviewRefresh("task-abc");
    notifyReportPreviewRefresh("task-def");

    assert.deepStrictEqual(receivedTaskIds, ["task-abc", "task-def"]);

    // Unsubscribe and ensure no further notifications
    unsubscribe();
    notifyReportPreviewRefresh("task-ghi");
    assert.deepStrictEqual(receivedTaskIds, ["task-abc", "task-def"]);
  });

  test("broadcasts to other tabs via BroadcastChannel when available", () => {
    const postedMessages: any[] = [];
    let channelClosed = false;

    class MockBroadcastChannel {
      name: string;
      onmessage: ((event: any) => void) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      postMessage(msg: any) {
        postedMessages.push(msg);
      }
      close() {
        channelClosed = true;
      }
    }

    (globalThis as any).window = {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
    };
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;

    notifyReportPreviewRefresh("task-999");

    assert.strictEqual(postedMessages.length, 1);
    assert.strictEqual(postedMessages[0].taskId, "task-999");
    assert.ok(typeof postedMessages[0].timestamp === "number");
    assert.strictEqual(channelClosed, true);
  });
});
