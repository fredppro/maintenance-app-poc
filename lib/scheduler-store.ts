import { create } from 'zustand'
import { Equipment, MaintenanceEntry, ViewMode } from './scheduler-types'
import { addDays, addMonths, addWeeks, addYears } from 'date-fns'
import { 
  addEquipment as dbAddEquipment, 
  deleteEquipment as dbDeleteEquipment,
  createTask as dbCreateTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  moveTask as dbMoveTask
} from './actions'

interface SchedulerState {
  equipment: Equipment[]
  entries: MaintenanceEntry[]
  viewMode: ViewMode
  currentDate: Date
  selectedEntry: MaintenanceEntry | null
  isLoading: boolean
  
  // Actions
  setEquipment: (equipment: Equipment[]) => void
  setEntries: (entries: MaintenanceEntry[]) => void
  addEquipment: (name: string, category?: string) => Promise<void>
  removeEquipment: (id: string) => Promise<void>
  addEntry: (entry: {
    title: string
    description?: string
    startTime: Date
    endTime: Date
    assignedTo: string
    equipmentId: string
  }) => Promise<void>
  updateEntry: (id: string, updates: Partial<MaintenanceEntry>) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  setViewMode: (mode: ViewMode) => void
  setCurrentDate: (date: Date) => void
  setSelectedEntry: (entry: MaintenanceEntry | null) => void
  navigateForward: () => void
  navigateBackward: () => void
  moveEntry: (entryId: string, newStartTime: Date, newEquipmentId?: string) => Promise<void>
  setLoading: (isLoading: boolean) => void
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  equipment: [],
  entries: [],
  viewMode: 'week',
  currentDate: new Date(),
  selectedEntry: null,
  isLoading: false,

  setEquipment: (equipment) => set({ equipment }),
  setEntries: (entries) => set({ entries }),
  setLoading: (isLoading) => set({ isLoading }),

  addEquipment: async (name, category) => {
    // Optimistic update would be hard without ID
    const newEquipment = await dbAddEquipment({ name, category })
    set((state) => ({
      equipment: [...state.equipment, newEquipment],
    }))
  },

  removeEquipment: async (id) => {
    const previousEquipment = get().equipment
    const previousEntries = get().entries
    
    // Optimistic update
    set((state) => ({
      equipment: state.equipment.filter((e) => e.id !== id),
      entries: state.entries.filter((e) => e.equipmentId !== id),
    }))

    try {
      await dbDeleteEquipment(id)
    } catch (error) {
      // Rollback
      set({ equipment: previousEquipment, entries: previousEntries })
      console.error('Failed to delete equipment:', error)
    }
  },

  addEntry: async (entryData) => {
    const newTask = await dbCreateTask(entryData)
    set((state) => ({
      entries: [...state.entries, newTask],
    }))
  },

  updateEntry: async (id, updates) => {
    const previousEntries = get().entries
    
    // Optimistic update
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    }))

    try {
      await dbUpdateTask(id, updates as any) // Simplified cast
    } catch (error) {
      set({ entries: previousEntries })
      console.error('Failed to update task:', error)
    }
  },

  removeEntry: async (id) => {
    const previousEntries = get().entries
    
    // Optimistic update
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      selectedEntry: state.selectedEntry?.id === id ? null : state.selectedEntry,
    }))

    try {
      await dbDeleteTask(id)
    } catch (error) {
      set({ entries: previousEntries })
      console.error('Failed to delete task:', error)
    }
  },

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

  moveEntry: async (entryId, newStartTime, newEquipmentId) => {
    const previousEntries = get().entries
    const entry = get().entries.find((e) => e.id === entryId)
    if (!entry) return

    const duration = entry.endTime.getTime() - entry.startTime.getTime()
    const newEndTime = new Date(newStartTime.getTime() + duration)

    // Optimistic update
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === entryId
            ? {
                ...e,
                startTime: newStartTime,
                endTime: newEndTime,
                equipmentId: newEquipmentId ?? e.equipmentId,
              }
            : e
      ),
    }))

    try {
      await dbMoveTask(entryId, newStartTime, newEndTime, newEquipmentId)
    } catch (error) {
      set({ entries: previousEntries })
      console.error('Failed to move task:', error)
    }
  },
}))
