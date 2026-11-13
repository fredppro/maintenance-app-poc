import { describe, expect, it } from "vitest";
import type { Equipment, MaintenanceEntry, Worker } from "../types";
import { searchSchedule } from "./search-schedule";

const date = new Date("2026-06-01T08:00:00.000Z");
const equipment: Equipment[] = [
  { id: "lathe", name: "Workshop Lathe", category: "Tools", imageFileId: null, sectionId: null, createdAt: date },
  { id: "pump", name: "Cooling Pump", category: "Production", imageFileId: null, sectionId: null, createdAt: date },
];
const worker: Worker = {
  id: "worker", name: "Taylor Worker", email: "taylor@example.test",
  phone: null, type: "INTERNAL", vendorId: null, createdAt: date,
};
const entries: MaintenanceEntry[] = [
  {
    id: "bearing", title: "Replace bearing", description: null, type: "PREVENTIVE",
    equipmentId: "lathe", maintenancePointId: null, status: "scheduled",
    startTime: date, endTime: null, completedAt: null, createdAt: date, updatedAt: date,
    assignments: [{ id: "assignment", taskId: "bearing", workerId: worker.id, startTime: date, endTime: null, worker }],
  },
  {
    id: "oil", title: "Change oil", description: null, type: "CORRECTIVE",
    equipmentId: "pump", maintenancePointId: null, status: "completed",
    startTime: date, endTime: date, completedAt: date, createdAt: date, updatedAt: date,
  },
];

describe("searchSchedule", () => {
  it.each([
    ["replace", "bearing", "lathe"],
    ["LATHE", "bearing", "lathe"],
    ["tools", "bearing", "lathe"],
    ["taylor worker", "bearing", "lathe"],
    ["taylor@example.test", "bearing", "lathe"],
    ["  pump  ", "oil", "pump"],
    ["change oil", "oil", "pump"],
  ])("keeps search results and timeline equipment consistent for %s", (query, taskId, equipmentId) => {
    const result = searchSchedule(entries, equipment, query);
    expect(result.entries.map((entry) => entry.id)).toEqual([taskId]);
    expect(result.equipment.map((item) => item.id)).toEqual([equipmentId]);
  });

  it("preserves all data and ordering when search is blank", () => {
    expect(searchSchedule(entries, equipment, "  ")).toEqual({ entries, equipment });
  });

  it("includes matching equipment even when it has no tasks", () => {
    expect(searchSchedule([], equipment, "production")).toEqual({
      entries: [],
      equipment: [equipment[1]],
    });
  });

  it("does not return unrelated equipment or tasks", () => {
    expect(searchSchedule(entries, equipment, "no match")).toEqual({
      entries: [],
      equipment: [],
    });
  });
});
