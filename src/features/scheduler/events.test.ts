import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  notifyTaskUpdated,
  subscribeToTaskUpdates,
} from "./events";

describe("scheduler events", () => {
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

  it("handles SSR environment gracefully when window is undefined", () => {
    delete (globalThis as any).window;
    delete (globalThis as any).BroadcastChannel;

    expect(() => notifyTaskUpdated("task-123")).not.toThrow();

    const unsubscribe = subscribeToTaskUpdates(() => {});
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("notifies and receives events in the same tab via CustomEvent", () => {
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
    const unsubscribe = subscribeToTaskUpdates((taskId) => {
      receivedTaskIds.push(taskId);
    });

    notifyTaskUpdated("task-abc");
    notifyTaskUpdated("task-def");

    expect(receivedTaskIds).toEqual(["task-abc", "task-def"]);

    unsubscribe();
    notifyTaskUpdated("task-ghi");
    expect(receivedTaskIds).toEqual(["task-abc", "task-def"]);
  });

  it("broadcasts to other tabs via BroadcastChannel when available", () => {
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

    notifyTaskUpdated("task-999");

    expect(postedMessages).toHaveLength(1);
    expect(postedMessages[0].taskId).toBe("task-999");
    expect(typeof postedMessages[0].timestamp).toBe("number");
    expect(channelClosed).toBe(true);
  });
});
