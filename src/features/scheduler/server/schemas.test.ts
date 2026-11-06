import { describe, expect, it } from "vitest";
import {
  createTaskSchema,
  maintenancePointSchema,
  updateTaskSchema,
} from "./schemas";
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

  it("accepts nullable completion timestamps for historical tasks", () => {
    const completedAt = "2026-10-12T17:15:00.000Z";
    expect(updateTaskSchema.parse({ completedAt }).completedAt?.toISOString()).toBe(
      completedAt,
    );
    expect(updateTaskSchema.parse({ completedAt: null }).completedAt).toBeNull();
  });

  it.each(["done", "IN-PROGRESS", " scheduled", "in_progress", ""])(
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

describe("task scheduling", () => {
  it("allows new tasks without a maintenance end time", () => {
    const parsed = createTaskSchema.parse({
      title: base.title,
      startTime: base.startTime,
      equipmentId: base.equipmentId,
    });

    expect(parsed.startTime.toISOString()).toBe("2026-10-12T08:00:00.000Z");
    expect(parsed.endTime).toBeUndefined();
  });

  it("continues accepting valid end times for legacy tasks", () => {
    expect(createTaskSchema.parse(base).endTime?.toISOString()).toBe(
      "2026-10-12T10:00:00.000Z",
    );
    expect(createTaskSchema.parse({ ...base, endTime: null }).endTime).toBeNull();
    expect(updateTaskSchema.parse({ endTime: null }).endTime).toBeNull();
  });

  it("rejects a legacy end time that is not after the start", () => {
    expect(
      createTaskSchema.safeParse({
        ...base,
        endTime: "2026-10-12T08:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("actual worker work logs", () => {
  it("accepts independent worker start and end times, including an open log", () => {
    const parsed = updateTaskSchema.parse({
      workerLogs: [
        {
          workerId: "worker-1",
          startTime: "2026-10-12T08:00:00.000Z",
          endTime: "2026-10-12T12:00:00.000Z",
        },
        {
          workerId: "worker-2",
          startTime: "2026-10-12T09:30:00.000Z",
          endTime: null,
        },
        { workerId: "worker-3", startTime: null, endTime: null },
      ],
    });

    expect(parsed.workerLogs).toHaveLength(3);
    expect(parsed.workerLogs?.[1].endTime).toBeNull();
    expect(parsed.workerLogs?.[2].startTime).toBeNull();
  });

  it("rejects an end time without a start and reversed worker intervals", () => {
    expect(
      updateTaskSchema.safeParse({
        workerLogs: [
          { workerId: "worker-1", startTime: null, endTime: "2026-10-12T12:00:00.000Z" },
        ],
      }).success,
    ).toBe(false);
    expect(
      updateTaskSchema.safeParse({
        workerLogs: [
          {
            workerId: "worker-1",
            startTime: "2026-10-12T12:00:00.000Z",
            endTime: "2026-10-12T08:00:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("maintenance point checklist templates", () => {
  it("accepts item-based checklist data and rejects invalid item values", () => {
    expect(
      maintenancePointSchema.parse({
        name: "Monthly inspection",
        checklistItems: ["Inspect belt", "Check lubrication"],
      }).checklistItems,
    ).toEqual(["Inspect belt", "Check lubrication"]);

    expect(
      maintenancePointSchema.safeParse({
        name: "Monthly inspection",
        checklistItems: ["", "x".repeat(301)],
      }).success,
    ).toBe(false);
  });
});

describe("daily worker-hour allocations", () => {
  const validAllocation = {
    workerId: "worker-1",
    workDate: "2026-10-12",
    startTime: "08:00",
    hours: 7.5,
  };

  it("accepts different daily hours for assigned workers", () => {
    const parsed = createTaskSchema.parse({
      ...base,
      workerIds: ["worker-1", "worker-2"],
      dailyHours: [
        validAllocation,
        { workerId: "worker-2", workDate: "2026-10-13", startTime: "09:15", hours: 4.25 },
      ],
    });

    expect(parsed.dailyHours).toHaveLength(2);
  });

  it("accepts multiple entries for the same worker and day", () => {
    const parsed = createTaskSchema.parse({
      ...base,
      workerIds: ["worker-1"],
      dailyHours: [
        validAllocation,
        { ...validAllocation, hours: 2.25 },
      ],
    });

    expect(parsed.dailyHours).toHaveLength(2);
  });

  it("allows inferred starts for new logs and preserves missing historical starts", () => {
    expect(
      createTaskSchema.safeParse({
        ...base,
        workerIds: ["worker-1"],
        dailyHours: [{ ...validAllocation, startTime: "" }],
      }).success,
    ).toBe(true);
    expect(
      updateTaskSchema.safeParse({
        dailyHours: [{ id: "legacy-log", ...validAllocation, startTime: "" }],
      }).success,
    ).toBe(true);
  });

  it("rejects entries for unassigned workers", () => {
    expect(
      createTaskSchema.safeParse({
        ...base,
        workerIds: [],
        dailyHours: [validAllocation],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid dates and hours outside a quarter-hour day", () => {
    expect(
      updateTaskSchema.safeParse({
        dailyHours: [{ ...validAllocation, workDate: "2026-02-31" }],
      }).success,
    ).toBe(false);
    expect(
      updateTaskSchema.safeParse({
        dailyHours: [{ ...validAllocation, hours: 24.25 }],
      }).success,
    ).toBe(false);
  });
});
