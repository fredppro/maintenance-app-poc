/** The statuses a maintenance task can have. Anything else is rejected by the server. */
export const TASK_STATUSES = ["scheduled", "in-progress", "completed"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
