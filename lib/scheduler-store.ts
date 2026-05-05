import { create } from 'zustand'
import { Equipment, MaintenanceEntry, ViewMode } from './scheduler-types'
import { addDays, addMonths, addWeeks, addYears } from 'date-fns'

interface SchedulerState {
  equipment: Equipment[]
  entries: MaintenanceEntry[]
  viewMode: ViewMode
  currentDate: Date
  selectedEntry: MaintenanceEntry | null
  
  // Actions
  addEquipment: (equipment: Omit<Equipment, 'id'>) => void
  removeEquipment: (id: string) => void
  addEntry: (entry: Omit<MaintenanceEntry, 'id'>) => void
  updateEntry: (id: string, updates: Partial<MaintenanceEntry>) => void
  removeEntry: (id: string) => void
  setViewMode: (mode: ViewMode) => void
  setCurrentDate: (date: Date) => void
  setSelectedEntry: (entry: MaintenanceEntry | null) => void
  navigateForward: () => void
  navigateBackward: () => void
  moveEntry: (entryId: string, newStartDate: Date, newEquipmentId?: string) => void
}

const generateId = () => Math.random().toString(36).substring(2, 9)

// Sample data
const sampleEquipment: Equipment[] = [
  { id: '1', name: 'CNC Machine A1', category: 'Manufacturing', status: 'active' },
  { id: '2', name: 'Hydraulic Press B2', category: 'Manufacturing', status: 'active' },
  { id: '3', name: 'Conveyor Belt C3', category: 'Material Handling', status: 'maintenance' },
  { id: '4', name: 'Industrial Robot D4', category: 'Automation', status: 'active' },
  { id: '5', name: 'Welding Station E5', category: 'Fabrication', status: 'active' },
  { id: '6', name: 'Compressor F6', category: 'Utilities', status: 'active' },
]

const today = new Date()
const sampleEntries: MaintenanceEntry[] = [
  {
    id: '1',
    equipmentId: '1',
    title: 'Monthly Inspection',
    description: 'Regular monthly inspection and calibration',
    startDate: addDays(today, 2),
    endDate: addDays(today, 2),
    type: 'inspection',
    status: 'scheduled',
  },
  {
    id: '2',
    equipmentId: '2',
    title: 'Oil Change',
    description: 'Replace hydraulic oil and filters',
    startDate: addDays(today, 5),
    endDate: addDays(today, 6),
    type: 'preventive',
    status: 'scheduled',
  },
  {
    id: '3',
    equipmentId: '3',
    title: 'Belt Replacement',
    description: 'Replace worn conveyor belt sections',
    startDate: addDays(today, 1),
    endDate: addDays(today, 3),
    type: 'corrective',
    status: 'in-progress',
  },
  {
    id: '4',
    equipmentId: '4',
    title: 'Software Update',
    description: 'Install latest firmware and calibrate sensors',
    startDate: addDays(today, 7),
    endDate: addDays(today, 7),
    type: 'preventive',
    status: 'scheduled',
  },
  {
    id: '5',
    equipmentId: '5',
    title: 'Annual Overhaul',
    description: 'Complete system overhaul and safety certification',
    startDate: addDays(today, 10),
    endDate: addDays(today, 14),
    type: 'preventive',
    status: 'scheduled',
  },
]

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  equipment: sampleEquipment,
  entries: sampleEntries,
  viewMode: 'week',
  currentDate: new Date(),
  selectedEntry: null,

  addEquipment: (equipment) =>
    set((state) => ({
      equipment: [...state.equipment, { ...equipment, id: generateId() }],
    })),

  removeEquipment: (id) =>
    set((state) => ({
      equipment: state.equipment.filter((e) => e.id !== id),
      entries: state.entries.filter((e) => e.equipmentId !== id),
    })),

  addEntry: (entry) =>
    set((state) => ({
      entries: [...state.entries, { ...entry, id: generateId() }],
    })),

  updateEntry: (id, updates) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    })),

  removeEntry: (id) =>
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      selectedEntry: state.selectedEntry?.id === id ? null : state.selectedEntry,
    })),

  setViewMode: (mode) => set({ viewMode: mode }),
  
  setCurrentDate: (date) => set({ currentDate: date }),
  
  setSelectedEntry: (entry) => set({ selectedEntry: entry }),

  navigateForward: () =>
    set((state) => {
      const { viewMode, currentDate } = state
      let newDate: Date
      switch (viewMode) {
        case 'day':
          newDate = addDays(currentDate, 1)
          break
        case 'week':
          newDate = addWeeks(currentDate, 1)
          break
        case 'month':
          newDate = addMonths(currentDate, 1)
          break
        case 'year':
          newDate = addYears(currentDate, 1)
          break
        default:
          newDate = currentDate
      }
      return { currentDate: newDate }
    }),

  navigateBackward: () =>
    set((state) => {
      const { viewMode, currentDate } = state
      let newDate: Date
      switch (viewMode) {
        case 'day':
          newDate = addDays(currentDate, -1)
          break
        case 'week':
          newDate = addWeeks(currentDate, -1)
          break
        case 'month':
          newDate = addMonths(currentDate, -1)
          break
        case 'year':
          newDate = addYears(currentDate, -1)
          break
        default:
          newDate = currentDate
      }
      return { currentDate: newDate }
    }),

  moveEntry: (entryId, newStartDate, newEquipmentId) =>
    set((state) => {
      const entry = state.entries.find((e) => e.id === entryId)
      if (!entry) return state

      const duration = entry.endDate.getTime() - entry.startDate.getTime()
      const newEndDate = new Date(newStartDate.getTime() + duration)

      return {
        entries: state.entries.map((e) =>
          e.id === entryId
            ? {
                ...e,
                startDate: newStartDate,
                endDate: newEndDate,
                equipmentId: newEquipmentId ?? e.equipmentId,
              }
            : e
        ),
      }
    }),
}))
