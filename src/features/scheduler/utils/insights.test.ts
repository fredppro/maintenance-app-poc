import { describe, expect, it } from "vitest";
import type { Equipment, MaintenanceEntry } from "../types";
import {
  summarizeEquipmentMaintenance,
  summarizeMaterials,
  summarizeMetrics,
} from "./insights";

const NOW = new Date("2026-06-10T12:00:00Z").getTime();
const day = (n: number) => new Date(NOW + n * 86_400_000);

function entry(overrides: Partial<MaintenanceEntry>): MaintenanceEntry {
  return {
    id: "t",
    title: "Task",
    description: null,
    type: "PREVENTIVE",
    startTime: day(1),
    endTime: day(1),
    equipmentId: "eq-1",
    status: "scheduled",
    createdAt: day(0),
    updatedAt: day(0),
    ...overrides,
  } as MaintenanceEntry;
}

const equipment = (id: string, name: string) =>
  ({ id, name }) as Equipment;

describe("summarizeMaterials", () => {
  it("merges the same material across tasks and sums quantity and cost", () => {
    const material = (id: string, quantity: number, price: string | null) =>
      ({ id, name: "Oil", reference: "R1", unit: "L", quantity, price }) as never;
    const rows = summarizeMaterials([
      entry({ id: "a", materials: [material("m1", 2, "5.00")] }),
      entry({ id: "b", materials: [material("m2", 3, null)] }),
    ]);
    expect(rows).toEqual([
      { key: "oil|R1|L", name: "Oil", reference: "R1", unit: "L", quantity: 5, cost: 10, taskCount: 2 },
    ]);
  });

  it("keeps different units or references apart and sorts by name", () => {
    const m = (name: string, unit: string, reference: string | null) =>
      ({ name, unit, reference, quantity: 1, price: null }) as never;
    const rows = summarizeMaterials([
      entry({ materials: [m("Bolt", "PC", null), m("Bolt", "BOX", null), m("Axle", "PC", "X")] }),
    ]);
    expect(rows.map((r) => `${r.name}/${r.unit}`)).toEqual(["Axle/PC", "Bolt/PC", "Bolt/BOX"]);
  });

  it("returns nothing when no task has materials", () => {
    expect(summarizeMaterials([entry({})])).toEqual([]);
  });
});

describe("summarizeMetrics", () => {
  const entries = [
    entry({ id: "1", status: "completed", endTime: day(-2), type: "CORRECTIVE" }),
    entry({ id: "2", status: "scheduled", endTime: day(-1) }),
    entry({ id: "3", status: "in-progress", endTime: day(2), type: "INSPECTION" }),
    entry({ id: "4", status: "scheduled", endTime: day(3), equipmentId: "eq-2" }),
  ];

  it("counts completion, overdue and upcoming tasks", () => {
    const m = summarizeMetrics(entries, [], NOW);
    expect(m).toMatchObject({ total: 4, completionRate: 25, overdue: 1, upcoming: 2 });
    expect(m.byType).toEqual({ preventive: 2, corrective: 1, inspection: 1 });
    expect(m.byStatus).toEqual({ scheduled: 2, inProgress: 1, completed: 1 });
  });

  it("ranks equipment by task count and omits idle equipment", () => {
    const m = summarizeMetrics(
      entries,
      [equipment("eq-1", "Lathe"), equipment("eq-2", "Press"), equipment("eq-3", "Idle")],
      NOW,
    );
    expect(m.topEquipment).toEqual([
      { label: "Lathe", value: 3 },
      { label: "Press", value: 1 },
    ]);
  });

  it("handles no tasks without dividing by zero", () => {
    expect(summarizeMetrics([], [], NOW).completionRate).toBe(0);
  });
});

describe("summarizeEquipmentMaintenance", () => {
  it("finds the next upcoming and last completed task for one equipment", () => {
    const result = summarizeEquipmentMaintenance(
      "eq-1",
      [
        entry({ id: "a", startTime: day(5), endTime: day(5) }),
        entry({ id: "b", startTime: day(2), endTime: day(2) }),
        entry({ id: "c", status: "completed", endTime: day(-5) }),
        entry({ id: "d", status: "completed", endTime: day(-1) }),
        entry({ id: "e", startTime: day(-3), endTime: day(-3) }),
        entry({ id: "f", equipmentId: "eq-2", startTime: day(1), endTime: day(1) }),
      ],
      NOW,
    );
    expect(result.upcomingCount).toBe(2);
    expect(result.next).toEqual(day(2));
    expect(result.last).toEqual(day(-1));
  });

  it("reports no dates when there is no history", () => {
    expect(summarizeEquipmentMaintenance("eq-1", [], NOW)).toEqual({
      upcomingCount: 0,
      next: undefined,
      last: undefined,
    });
  });
});
