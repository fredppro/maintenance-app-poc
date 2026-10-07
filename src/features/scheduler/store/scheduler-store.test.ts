import { afterEach, describe, expect, it, vi } from "vitest";
import { createSchedulerStore } from "./scheduler-store";
import { Equipment, MaintenanceEntry, Worker } from "../types";

describe("scheduler store", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const dummyEquipment: Equipment = {
    id: "eq-1",
    name: "Conveyor Belt A",
    category: "Logistics",
    imageFileId: null,
    sectionId: null,
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

  it("initializes with default state or provided initial state", () => {
    const defaultStore = createSchedulerStore();
    const defaultState = defaultStore.getState();
    expect(defaultState.equipment).toEqual([]);
    expect(defaultState.entries).toEqual([]);
    expect(defaultState.workers).toEqual([]);
    expect(defaultState.viewMode).toBe("week");
    expect(defaultState.selectedEntry).toBeNull();
    expect(defaultState.isLoading).toBe(false);

    const customStore = createSchedulerStore({
      equipment: [dummyEquipment],
      entries: [dummyEntry],
      workers: [dummyWorker],
      viewMode: "day",
    });
    const customState = customStore.getState();
    expect(customState.equipment).toHaveLength(1);
    expect(customState.entries).toHaveLength(1);
    expect(customState.workers).toHaveLength(1);
    expect(customState.viewMode).toBe("day");
  });

  describe("equipment actions", () => {
    it("sets, adds, and updates equipment", () => {
      const store = createSchedulerStore();
      store.getState().setEquipment([dummyEquipment]);
      expect(store.getState().equipment).toHaveLength(1);

      const eq2: Equipment = {
        id: "eq-2",
        name: "Hydraulic Press",
        category: "Heavy Machinery",
        imageFileId: null,
        sectionId: null,
        createdAt: new Date(),
      };
      store.getState().addEquipment(eq2);
      expect(store.getState().equipment).toHaveLength(2);

      store.getState().updateEquipment({ ...eq2, name: "Hydraulic Press Updated" });
      const updated = store.getState().equipment.find((e) => e.id === "eq-2");
      expect(updated?.name).toBe("Hydraulic Press Updated");
    });

    it("removing equipment cascades and removes its entries", () => {
      const store = createSchedulerStore({
        equipment: [dummyEquipment],
        entries: [dummyEntry],
      });

      expect(store.getState().equipment).toHaveLength(1);
      expect(store.getState().entries).toHaveLength(1);

      store.getState().removeEquipment("eq-1");
      expect(store.getState().equipment).toHaveLength(0);
      expect(store.getState().entries).toHaveLength(0);
    });
  });

  describe("entry actions", () => {
    it("sets, adds, updates, and replaces entries", () => {
      const store = createSchedulerStore();
      store.getState().setEntries([dummyEntry]);
      expect(store.getState().entries).toHaveLength(1);

      const entry2: MaintenanceEntry = {
        ...dummyEntry,
        id: "task-2",
        title: "Filter Change",
      };
      store.getState().addEntry(entry2);
      expect(store.getState().entries).toHaveLength(2);

      store.getState().setSelectedEntry(dummyEntry);
      expect(store.getState().selectedEntry?.id).toBe("task-1");

      store.getState().updateEntry("task-1", { status: "completed" });
      expect(store.getState().entries.find((e) => e.id === "task-1")?.status).toBe("completed");
      expect(store.getState().selectedEntry?.status).toBe("completed");

      const replaced: MaintenanceEntry = {
        ...dummyEntry,
        title: "Motor Inspection Overhaul",
      };
      store.getState().replaceEntry("task-1", replaced);
      expect(store.getState().entries.find((e) => e.id === "task-1")?.title).toBe("Motor Inspection Overhaul");
      expect(store.getState().selectedEntry?.title).toBe("Motor Inspection Overhaul");
    });

    it("removes entry and unselects it if currently selected", () => {
      const store = createSchedulerStore({
        entries: [dummyEntry],
        selectedEntry: dummyEntry,
      });

      store.getState().removeEntry("task-1");
      expect(store.getState().entries).toHaveLength(0);
      expect(store.getState().selectedEntry).toBeNull();
    });
  });

  describe("navigation and date actions", () => {
    it("navigates forward and backward in day mode", () => {
      const initialDate = new Date("2026-05-15T12:00:00.000Z");
      const store = createSchedulerStore({
        currentDate: initialDate,
        viewMode: "day",
      });

      store.getState().navigateForward();
      expect(store.getState().currentDate.getDate()).toBe(16);

      store.getState().navigateBackward();
      expect(store.getState().currentDate.getDate()).toBe(15);
    });

    it("navigates forward and backward in week mode", () => {
      const initialDate = new Date("2026-05-15T12:00:00.000Z");
      const store = createSchedulerStore({
        currentDate: initialDate,
        viewMode: "week",
      });

      store.getState().navigateForward();
      expect(store.getState().currentDate.getDate()).toBe(22);

      store.getState().navigateBackward();
      expect(store.getState().currentDate.getDate()).toBe(15);
    });

    it("navigates forward and backward in month mode", () => {
      const initialDate = new Date("2026-05-15T12:00:00.000Z");
      const store = createSchedulerStore({
        currentDate: initialDate,
        viewMode: "month",
      });

      store.getState().navigateForward();
      expect(store.getState().currentDate.getMonth()).toBe(5);

      store.getState().navigateBackward();
      expect(store.getState().currentDate.getMonth()).toBe(4);
    });

    it("navigates forward from the last day of a month without leaving that month", () => {
      const store = createSchedulerStore({
        currentDate: new Date("2026-01-31T12:00:00.000Z"),
        viewMode: "month",
      });

      store.getState().navigateForward();

      expect(store.getState().currentDate.toISOString()).toBe(
        "2026-02-28T12:00:00.000Z",
      );
    });

    it("navigates forward across a year boundary", () => {
      const store = createSchedulerStore({
        currentDate: new Date("2026-12-15T12:00:00.000Z"),
        viewMode: "month",
      });

      store.getState().navigateForward();

      expect(store.getState().currentDate.toISOString()).toBe(
        "2027-01-15T12:00:00.000Z",
      );
    });

    it("navigates forward and backward in year mode", () => {
      const initialDate = new Date("2026-05-15T12:00:00.000Z");
      const store = createSchedulerStore({
        currentDate: initialDate,
        viewMode: "year",
      });

      store.getState().navigateForward();
      expect(store.getState().currentDate.getFullYear()).toBe(2027);

      store.getState().navigateBackward();
      expect(store.getState().currentDate.getFullYear()).toBe(2026);
    });

    it("sets current date directly", () => {
      const store = createSchedulerStore();
      const newDate = new Date("2027-01-01T00:00:00.000Z");
      store.getState().setCurrentDate(newDate);
      expect(store.getState().currentDate).toBe(newDate);
    });
  });

  describe("moveEntry action", () => {
    it("shifts start and end dates while preserving task duration", () => {
      const store = createSchedulerStore({
        entries: [dummyEntry],
      });

      const newStart = new Date("2026-06-02T14:00:00.000Z");
      store.getState().moveEntry("task-1", newStart, "eq-2");

      const moved = store.getState().entries.find((e) => e.id === "task-1");
      expect(moved).toBeTruthy();
      expect(moved?.startTime.toISOString()).toBe("2026-06-02T14:00:00.000Z");
      expect(moved?.endTime.toISOString()).toBe("2026-06-02T16:00:00.000Z");
      expect(moved?.equipmentId).toBe("eq-2");
    });

    it("retains existing equipmentId when newEquipmentId is not supplied", () => {
      const store = createSchedulerStore({
        entries: [dummyEntry],
      });

      const newStart = new Date("2026-06-03T08:00:00.000Z");
      store.getState().moveEntry("task-1", newStart);

      const moved = store.getState().entries.find((e) => e.id === "task-1");
      expect(moved).toBeTruthy();
      expect(moved?.equipmentId).toBe("eq-1");
      expect(moved?.startTime.toISOString()).toBe("2026-06-03T08:00:00.000Z");
      expect(moved?.endTime.toISOString()).toBe("2026-06-03T10:00:00.000Z");
    });

    it("does nothing if entry is not found", () => {
      const store = createSchedulerStore({
        entries: [dummyEntry],
      });

      store.getState().moveEntry("nonexistent", new Date());
      expect(store.getState().entries).toHaveLength(1);
      expect(store.getState().entries[0].id).toBe("task-1");
    });
  });

  describe("workers and loading actions", () => {
    it("sets workers and loading state", () => {
      const store = createSchedulerStore();
      store.getState().setWorkers([dummyWorker]);
      expect(store.getState().workers).toHaveLength(1);

      store.getState().setLoading(true);
      expect(store.getState().isLoading).toBe(true);
      store.getState().setLoading(false);
      expect(store.getState().isLoading).toBe(false);
    });

    it("keeps loading until 300ms after the most recent view change", () => {
      vi.useFakeTimers();
      const store = createSchedulerStore();

      store.getState().setViewMode("day");
      vi.advanceTimersByTime(200);
      store.getState().setViewMode("month");
      vi.advanceTimersByTime(200);

      expect(store.getState().isLoading).toBe(true);
      expect(store.getState().viewMode).toBe("month");

      vi.advanceTimersByTime(100);
      expect(store.getState().isLoading).toBe(false);
    });
  });
});
