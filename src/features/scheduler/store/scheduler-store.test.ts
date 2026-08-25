import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { createSchedulerStore } from "./scheduler-store";
import { Equipment, MaintenanceEntry, Worker } from "../types";

describe("scheduler store", () => {
  const dummyEquipment: Equipment = {
    id: "eq-1",
    name: "Conveyor Belt A",
    category: "Logistics",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const dummyWorker: Worker = {
    id: "worker-1",
    name: "Alex Smith",
    email: "alex@example.com",
    phone: "123456789",
    type: "INTERNAL",
    vendorId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const dummyEntry: MaintenanceEntry = {
    id: "task-1",
    title: "Motor Inspection",
    description: "Check temperature and lubrication",
    type: "INSPECTION",
    startTime: new Date("2026-06-01T10:00:00.000Z"),
    endTime: new Date("2026-06-01T12:00:00.000Z"),
    equipmentId: "eq-1",
    status: "scheduled",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  test("initializes with default state or provided initial state", () => {
    const defaultStore = createSchedulerStore();
    const defaultState = defaultStore.getState();
    assert.deepStrictEqual(defaultState.equipment, []);
    assert.deepStrictEqual(defaultState.entries, []);
    assert.deepStrictEqual(defaultState.workers, []);
    assert.strictEqual(defaultState.viewMode, "week");
    assert.strictEqual(defaultState.selectedEntry, null);
    assert.strictEqual(defaultState.isLoading, false);

    const customStore = createSchedulerStore({
      equipment: [dummyEquipment],
      entries: [dummyEntry],
      workers: [dummyWorker],
      viewMode: "day",
    });
    const customState = customStore.getState();
    assert.strictEqual(customState.equipment.length, 1);
    assert.strictEqual(customState.entries.length, 1);
    assert.strictEqual(customState.workers.length, 1);
    assert.strictEqual(customState.viewMode, "day");
  });

  describe("equipment actions", () => {
    test("sets, adds, and updates equipment", () => {
      const store = createSchedulerStore();
      store.getState().setEquipment([dummyEquipment]);
      assert.strictEqual(store.getState().equipment.length, 1);

      const eq2: Equipment = {
        id: "eq-2",
        name: "Hydraulic Press",
        category: "Heavy Machinery",
        createdAt: new Date(),
      };
      store.getState().addEquipment(eq2);
      assert.strictEqual(store.getState().equipment.length, 2);

      store.getState().updateEquipment({ ...eq2, name: "Hydraulic Press Updated" });
      const updated = store.getState().equipment.find((e) => e.id === "eq-2");
      assert.strictEqual(updated?.name, "Hydraulic Press Updated");
    });

    test("removing equipment cascades and removes its entries", () => {
      const store = createSchedulerStore({
        equipment: [dummyEquipment],
        entries: [dummyEntry],
      });

      assert.strictEqual(store.getState().equipment.length, 1);
      assert.strictEqual(store.getState().entries.length, 1);

      store.getState().removeEquipment("eq-1");
      assert.strictEqual(store.getState().equipment.length, 0);
      assert.strictEqual(store.getState().entries.length, 0);
    });
  });

  describe("entry actions", () => {
    test("sets, adds, updates, and replaces entries", () => {
      const store = createSchedulerStore();
      store.getState().setEntries([dummyEntry]);
      assert.strictEqual(store.getState().entries.length, 1);

      const entry2: MaintenanceEntry = {
        ...dummyEntry,
        id: "task-2",
        title: "Filter Change",
      };
      store.getState().addEntry(entry2);
      assert.strictEqual(store.getState().entries.length, 2);

      store.getState().setSelectedEntry(dummyEntry);
      assert.strictEqual(store.getState().selectedEntry?.id, "task-1");

      // Update entry updates both entries and selectedEntry
      store.getState().updateEntry("task-1", { status: "completed" });
      assert.strictEqual(
        store.getState().entries.find((e) => e.id === "task-1")?.status,
        "completed"
      );
      assert.strictEqual(store.getState().selectedEntry?.status, "completed");

      // Replace entry updates both entries and selectedEntry
      const replaced: MaintenanceEntry = {
        ...dummyEntry,
        title: "Motor Inspection Overhaul",
      };
      store.getState().replaceEntry("task-1", replaced);
      assert.strictEqual(
        store.getState().entries.find((e) => e.id === "task-1")?.title,
        "Motor Inspection Overhaul"
      );
      assert.strictEqual(store.getState().selectedEntry?.title, "Motor Inspection Overhaul");
    });

    test("removes entry and unselects it if currently selected", () => {
      const store = createSchedulerStore({
        entries: [dummyEntry],
        selectedEntry: dummyEntry,
      });

      store.getState().removeEntry("task-1");
      assert.strictEqual(store.getState().entries.length, 0);
      assert.strictEqual(store.getState().selectedEntry, null);
    });
  });

  describe("navigation and date actions", () => {
    test("navigates forward and backward in day mode", () => {
      const initialDate = new Date("2026-05-15T12:00:00.000Z");
      const store = createSchedulerStore({
        currentDate: initialDate,
        viewMode: "day",
      });

      store.getState().navigateForward();
      assert.strictEqual(store.getState().currentDate.getDate(), 16);

      store.getState().navigateBackward();
      assert.strictEqual(store.getState().currentDate.getDate(), 15);
    });

    test("navigates forward and backward in week mode", () => {
      const initialDate = new Date("2026-05-15T12:00:00.000Z");
      const store = createSchedulerStore({
        currentDate: initialDate,
        viewMode: "week",
      });

      store.getState().navigateForward();
      assert.strictEqual(store.getState().currentDate.getDate(), 22);

      store.getState().navigateBackward();
      assert.strictEqual(store.getState().currentDate.getDate(), 15);
    });

    test("navigates forward and backward in month mode", () => {
      const initialDate = new Date("2026-05-15T12:00:00.000Z");
      const store = createSchedulerStore({
        currentDate: initialDate,
        viewMode: "month",
      });

      store.getState().navigateForward();
      assert.strictEqual(store.getState().currentDate.getMonth(), 5); // June (0-indexed)

      store.getState().navigateBackward();
      assert.strictEqual(store.getState().currentDate.getMonth(), 4); // May
    });

    test("navigates forward and backward in year mode", () => {
      const initialDate = new Date("2026-05-15T12:00:00.000Z");
      const store = createSchedulerStore({
        currentDate: initialDate,
        viewMode: "year",
      });

      store.getState().navigateForward();
      assert.strictEqual(store.getState().currentDate.getFullYear(), 2027);

      store.getState().navigateBackward();
      assert.strictEqual(store.getState().currentDate.getFullYear(), 2026);
    });

    test("sets current date directly", () => {
      const store = createSchedulerStore();
      const newDate = new Date("2027-01-01T00:00:00.000Z");
      store.getState().setCurrentDate(newDate);
      assert.strictEqual(store.getState().currentDate, newDate);
    });
  });

  describe("moveEntry action", () => {
    test("shifts start and end dates while preserving task duration", () => {
      // 2 hour duration (10:00 to 12:00)
      const store = createSchedulerStore({
        entries: [dummyEntry],
      });

      const newStart = new Date("2026-06-02T14:00:00.000Z");
      store.getState().moveEntry("task-1", newStart, "eq-2");

      const moved = store.getState().entries.find((e) => e.id === "task-1");
      assert.ok(moved);
      assert.strictEqual(moved.startTime.toISOString(), "2026-06-02T14:00:00.000Z");
      assert.strictEqual(moved.endTime.toISOString(), "2026-06-02T16:00:00.000Z");
      assert.strictEqual(moved.equipmentId, "eq-2");
    });

    test("retains existing equipmentId when newEquipmentId is not supplied", () => {
      const store = createSchedulerStore({
        entries: [dummyEntry],
      });

      const newStart = new Date("2026-06-03T08:00:00.000Z");
      store.getState().moveEntry("task-1", newStart);

      const moved = store.getState().entries.find((e) => e.id === "task-1");
      assert.ok(moved);
      assert.strictEqual(moved.equipmentId, "eq-1");
      assert.strictEqual(moved.startTime.toISOString(), "2026-06-03T08:00:00.000Z");
      assert.strictEqual(moved.endTime.toISOString(), "2026-06-03T10:00:00.000Z");
    });

    test("does nothing if entry is not found", () => {
      const store = createSchedulerStore({
        entries: [dummyEntry],
      });

      store.getState().moveEntry("nonexistent", new Date());
      assert.strictEqual(store.getState().entries.length, 1);
      assert.strictEqual(store.getState().entries[0].id, "task-1");
    });
  });

  describe("workers and loading actions", () => {
    test("sets workers and loading state", () => {
      const store = createSchedulerStore();
      store.getState().setWorkers([dummyWorker]);
      assert.strictEqual(store.getState().workers.length, 1);

      store.getState().setLoading(true);
      assert.strictEqual(store.getState().isLoading, true);
      store.getState().setLoading(false);
      assert.strictEqual(store.getState().isLoading, false);
    });
  });
});
