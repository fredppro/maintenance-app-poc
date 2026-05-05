export type ViewMode = 'day' | 'week' | 'month' | 'year'

export interface Equipment {
  id: string
  name: string
  category: string
  status: 'active' | 'maintenance' | 'inactive'
}

export interface MaintenanceEntry {
  id: string
  equipmentId: string
  title: string
  description?: string
  startDate: Date
  endDate: Date
  type: 'preventive' | 'corrective' | 'inspection'
  status: 'scheduled' | 'in-progress' | 'completed'
  assignedWorkerName?: string
  assignedWorkerEmail?: string
}

export interface TimelineCell {
  date: Date
  equipmentId: string
}
