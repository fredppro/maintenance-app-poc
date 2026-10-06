import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyReportPreviewRefresh } from "../events";
import { useReportPreviewRefresh } from "./useReportPreviewRefresh";

describe("useReportPreviewRefresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes only the matching task and unsubscribes on task change and unmount", () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    const onRefresh = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ taskId }: { taskId: string }) =>
        useReportPreviewRefresh(taskId, onRefresh),
      { initialProps: { taskId: "task-1" } },
    );

    act(() => {
      notifyReportPreviewRefresh("task-2");
      notifyReportPreviewRefresh("task-1");
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender({ taskId: "task-2" });

    act(() => {
      notifyReportPreviewRefresh("task-1");
      notifyReportPreviewRefresh("task-2");
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);

    unmount();
    act(() => notifyReportPreviewRefresh("task-2"));
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });
});
