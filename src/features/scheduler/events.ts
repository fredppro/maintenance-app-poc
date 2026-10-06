export const TASK_UPDATED_EVENT = "maintenance-task-updated";

const CHANNEL_NAME = TASK_UPDATED_EVENT;

export interface TaskUpdatedEvent {
  taskId: string;
  timestamp: number;
}

/**
 * Notify listeners that a task was updated.
 *
 * - Current tab -> CustomEvent
 * - Other tabs/windows -> BroadcastChannel
 */
export function notifyTaskUpdated(taskId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: TaskUpdatedEvent = {
    taskId,
    timestamp: Date.now(),
  };

  // Same tab
  window.dispatchEvent(
    new CustomEvent<TaskUpdatedEvent>(TASK_UPDATED_EVENT, {
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
 * Subscribe to task update events.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToTaskUpdates(
  listener: (taskId: string) => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleCustomEvent = (event: Event) => {
    const { taskId } = (event as CustomEvent<TaskUpdatedEvent>).detail;
    listener(taskId);
  };

  window.addEventListener(TASK_UPDATED_EVENT, handleCustomEvent);

  let channel: BroadcastChannel | undefined;

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);

    channel.onmessage = (event: MessageEvent<TaskUpdatedEvent>) => {
      listener(event.data.taskId);
    };
  }

  return () => {
    window.removeEventListener(TASK_UPDATED_EVENT, handleCustomEvent);
    channel?.close();
  };
}