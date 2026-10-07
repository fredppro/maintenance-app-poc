import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import { createStore } from "zustand/vanilla";
import {
  Equipment,
  MaintenanceEntry,
  UpdateEntryPayload,
  ViewMode,
  Worker,
} from "@/features/scheduler/types";

export interface SiteOption {
  id: string;
  name: string;
  current: boolean;
}

export interface SchedulerState {
  equipment: Equipment[];
  entries: MaintenanceEntry[];
  workers: Worker[];
  sites: SiteOption[];
  viewMode: ViewMode;
  currentDate: Date;
  selectedEntry: MaintenanceEntry | null;
  isLoading: boolean;
  workersViewRequest: number;

  setEquipment: (equipment: Equipment[]) => void;
  setEntries: (entries: MaintenanceEntry[]) => void;
  setWorkers: (workers: Worker[]) => void;
  requestWorkersView: () => void;
  addEquipment: (equipment: Equipment) => void;
  updateEquipment: (equipment: Equipment) => void;
  removeEquipment: (id: string) => void;
  addEntry: (entry: MaintenanceEntry) => void;
  updateEntry: (id: string, updates: UpdateEntryPayload) => void;
  replaceEntry: (id: string, entry: MaintenanceEntry) => void;
  removeEntry: (id: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setCurrentDate: (date: Date) => void;
  setSelectedEntry: (entry: MaintenanceEntry | null) => void;
  navigateForward: () => void;
  navigateBackward: () => void;
  moveEntry: (
    entryId: string,
    newStartTime: Date,
    newEquipmentId?: string,
  ) => void;
  setLoading: (isLoading: boolean) => void;
}

export type SchedulerStore = ReturnType<typeof createSchedulerStore>;

export type SchedulerInitialState = Partial<
  Pick<
    SchedulerState,
    | "equipment"
    | "entries"
    | "workers"
    | "sites"
    | "viewMode"
    | "currentDate"
    | "selectedEntry"
    | "isLoading"
    | "workersViewRequest"
  >
>;

const defaultSchedulerState = (): Pick<
  SchedulerState,
  | "equipment"
  | "entries"
  | "workers"
  | "sites"
  | "viewMode"
  | "currentDate"
  | "selectedEntry"
  | "isLoading"
  | "workersViewRequest"
> => ({
  equipment: [],
  entries: [],
  workers: [],
  sites: [],
  viewMode: "week",
  currentDate: new Date(),
  selectedEntry: null,
  isLoading: false,
  workersViewRequest: 0,
});

export function createSchedulerStore(initialState: SchedulerInitialState = {}) {
  let viewModeTimer: ReturnType<typeof setTimeout> | undefined;

  return createStore<SchedulerState>()((set, get) => ({
    ...defaultSchedulerState(),
    ...initialState,

    setEquipment: (equipment) => set({ equipment }),
    setEntries: (entries) => set({ entries }),
    setWorkers: (workers) => set({ workers }),
    requestWorkersView: () =>
      set((state) => ({ workersViewRequest: state.workersViewRequest + 1 })),
    setLoading: (isLoading) => set({ isLoading }),

    addEquipment: (equipment) =>
      set((state) => ({
        equipment: [...state.equipment, equipment],
      })),

    updateEquipment: (equipment) =>
      set((state) => ({
        equipment: state.equipment.map((item) =>
          item.id === equipment.id ? equipment : item,
        ),
      })),

    removeEquipment: (id) =>
      set((state) => ({
        equipment: state.equipment.filter((item) => item.id !== id),
        entries: state.entries.filter((entry) => entry.equipmentId !== id),
      })),

    addEntry: (entry) =>
      set((state) => ({
        entries: [...state.entries, entry],
      })),

    updateEntry: (id, updates) =>
      set((state) => ({
        entries: state.entries.map((entry) =>
          entry.id === id ? { ...entry, ...updates } : entry,
        ),
        selectedEntry:
          state.selectedEntry?.id === id
            ? { ...state.selectedEntry, ...updates }
            : state.selectedEntry,
      })),

    replaceEntry: (id, entry) =>
      set((state) => ({
        entries: state.entries.map((item) => (item.id === id ? entry : item)),
        selectedEntry: state.selectedEntry?.id === id ? entry : state.selectedEntry,
      })),

    removeEntry: (id) =>
      set((state) => ({
        entries: state.entries.filter((entry) => entry.id !== id),
        selectedEntry: state.selectedEntry?.id === id ? null : state.selectedEntry,
      })),

    setViewMode: (mode) => {
      if (viewModeTimer) {
        clearTimeout(viewModeTimer);
      }
      set({ isLoading: true, viewMode: mode });
      viewModeTimer = setTimeout(() => {
        viewModeTimer = undefined;
        set({ isLoading: false });
      }, 300);
    },

    setCurrentDate: (date) => set({ currentDate: date }),

    setSelectedEntry: (entry) => set({ selectedEntry: entry }),

    navigateForward: () =>
      set((state) => {
        const { viewMode, currentDate } = state;
        let newDate: Date;
        switch (viewMode) {
          case "day":
            newDate = addDays(currentDate, 1);
            break;
          case "week":
            newDate = addWeeks(currentDate, 1);
            break;
          case "month":
            newDate = addMonths(currentDate, 1);
            break;
          case "year":
            newDate = addYears(currentDate, 1);
            break;
          default:
            newDate = currentDate;
        }
        return { currentDate: newDate };
      }),

    navigateBackward: () =>
      set((state) => {
        const { viewMode, currentDate } = state;
        let newDate: Date;
        switch (viewMode) {
          case "day":
            newDate = addDays(currentDate, -1);
            break;
          case "week":
            newDate = addWeeks(currentDate, -1);
            break;
          case "month":
            newDate = addMonths(currentDate, -1);
            break;
          case "year":
            newDate = addYears(currentDate, -1);
            break;
          default:
            newDate = currentDate;
        }
        return { currentDate: newDate };
      }),

    moveEntry: (entryId, newStartTime, newEquipmentId) => {
      const entry = get().entries.find((item) => item.id === entryId);
      if (!entry) return;

      const duration = entry.endTime.getTime() - entry.startTime.getTime();
      const newEndTime = new Date(newStartTime.getTime() + duration);

      set((state) => ({
        entries: state.entries.map((item) =>
          item.id === entryId
            ? {
                ...item,
                startTime: newStartTime,
                endTime: newEndTime,
                equipmentId: newEquipmentId ?? item.equipmentId,
              }
            : item,
        ),
      }));
    },
  }));
}
