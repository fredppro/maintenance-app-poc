import { describe, expect, it } from "vitest";
import { createTaskSchema, updateTaskSchema } from "./schemas";
import { TASK_STATUSES, isTaskStatus } from "../task-status";

const base = {
  title: "Quarterly check",
  startTime: "2026-10-12T08:00:00.000Z",
  endTime: "2026-10-12T10:00:00.000Z",
  equipmentId: "equip-1",
};

describe("task status", () => {
  it.each(TASK_STATUSES)("accepts %s on create and update", (status) => {
    expect(createTaskSchema.parse({ ...base, status }).status).toBe(status);
    expect(updateTaskSchema.parse({ status }).status).toBe(status);
  });

  it("leaves the status optional", () => {
    expect(createTaskSchema.parse(base).status).toBeUndefined();
    expect(updateTaskSchema.parse({ title: "x" }).status).toBeUndefined();
  });

  it.each(["done", "cancelled", "IN-PROGRESS", " scheduled", "in_progress", ""])(
    "rejects the unknown status %j on create and update",
    (status) => {
      expect(createTaskSchema.safeParse({ ...base, status }).success).toBe(false);
      expect(updateTaskSchema.safeParse({ status }).success).toBe(false);
    },
  );

  it("exposes a type guard for the same list", () => {
    expect(isTaskStatus("completed")).toBe(true);
    expect(isTaskStatus("done")).toBe(false);
    expect(isTaskStatus(undefined)).toBe(false);
  });
});
