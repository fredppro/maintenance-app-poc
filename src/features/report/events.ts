export const REPORT_PREVIEW_EVENT = "maintenance-report-preview";

const CHANNEL_NAME = REPORT_PREVIEW_EVENT;

export interface ReportPreviewEvent {
  taskId: string;
  timestamp: number;
}

/**
 * Notify every preview that a task report should be refreshed.
 *
 * - Current tab -> CustomEvent
 * - Other tabs/windows -> BroadcastChannel
 */
export function notifyReportPreviewRefresh(taskId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: ReportPreviewEvent = {
    taskId,
    timestamp: Date.now(),
  };

  // Same tab
  window.dispatchEvent(
    new CustomEvent<ReportPreviewEvent>(REPORT_PREVIEW_EVENT, {
      detail: payload,
    }),
  );

  // Other tabs/windows
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  }
}

/**
 * Subscribe to preview refresh events.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToReportPreviewRefresh(
  listener: (taskId: string) => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleCustomEvent = (event: Event) => {
    const { taskId } = (event as CustomEvent<ReportPreviewEvent>).detail;
    listener(taskId);
  };

  window.addEventListener(REPORT_PREVIEW_EVENT, handleCustomEvent);

  let channel: BroadcastChannel | undefined;

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);

    channel.onmessage = (event: MessageEvent<ReportPreviewEvent>) => {
      listener(event.data.taskId);
    };
  }

  return () => {
    window.removeEventListener(REPORT_PREVIEW_EVENT, handleCustomEvent);
    channel?.close();
  };
}