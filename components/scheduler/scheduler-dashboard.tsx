'use client'

import { SchedulerToolbar } from './scheduler-toolbar'
import { TimelineGrid } from './timeline-grid'
import { EquipmentPanel } from './equipment-panel'
import { useSchedulerStore } from '@/lib/scheduler-store'
import { Wrench, Search, AlertTriangle } from 'lucide-react'

export function SchedulerDashboard() {
  const { entries, equipment } = useSchedulerStore()

  const stats = {
    total: entries.length,
    scheduled: entries.filter((e) => e.status === 'scheduled').length,
    inProgress: entries.filter((e) => e.status === 'in-progress').length,
    completed: entries.filter((e) => e.status === 'completed').length,
    preventive: entries.filter((e) => e.type === 'preventive').length,
    corrective: entries.filter((e) => e.type === 'corrective').length,
    inspection: entries.filter((e) => e.type === 'inspection').length,
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Maintenance Scheduler
              </h1>
              <p className="text-sm text-muted-foreground">
                Equipment service and maintenance planning
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-1/20 border border-chart-1/40" />
                <span className="text-muted-foreground">Preventive</span>
                <span className="font-medium text-foreground">{stats.preventive}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-3/20 border border-chart-3/40" />
                <span className="text-muted-foreground">Corrective</span>
                <span className="font-medium text-foreground">{stats.corrective}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-2/20 border border-chart-2/40" />
                <span className="text-muted-foreground">Inspection</span>
                <span className="font-medium text-foreground">{stats.inspection}</span>
              </div>
            </div>
            
            <div className="h-8 w-px bg-border" />
            
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Equipment: </span>
                <span className="font-medium text-foreground">{equipment.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Scheduled: </span>
                <span className="font-medium text-foreground">{stats.scheduled}</span>
              </div>
              <div>
                <span className="text-muted-foreground">In Progress: </span>
                <span className="font-medium text-chart-3">{stats.inProgress}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
        {/* Toolbar */}
        <SchedulerToolbar />

        {/* Content Area */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Timeline Grid */}
          <TimelineGrid />

          {/* Equipment Panel */}
          <EquipmentPanel />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>Click on a cell to schedule maintenance</span>
            <span>•</span>
            <span>Drag entries to reschedule</span>
            <span>•</span>
            <span>Use zoom controls to change view</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              <span>Preventive</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Corrective</span>
            </div>
            <div className="flex items-center gap-1">
              <Search className="w-3 h-3" />
              <span>Inspection</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
