'use client'

import { useSchedulerStore } from '@/lib/scheduler-store'
import { MaintenanceEntry, ViewMode } from '@/lib/scheduler-types'
import { cn } from '@/lib/utils'
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  startOfYear,
  eachMonthOfInterval,
  isSameDay,
  isWithinInterval,
  differenceInDays,
  startOfDay,
  addHours,
  eachHourOfInterval,
  startOfHour,
  isSameHour,
  isSameMonth,
  endOfDay,
} from 'date-fns'
import { useState, useRef, useCallback, useMemo } from 'react'
import { MaintenanceEntryBlock } from './maintenance-entry-block'
import { AddEntryDialog } from './add-entry-dialog'
import { Box, Loader2 } from 'lucide-react'

export function TimelineGrid() {
  const {
    equipment,
    entries,
    viewMode,
    currentDate,
    isLoading,
    moveEntry,
    setViewMode,
    setCurrentDate,
  } = useSchedulerStore()
  
  const [draggedEntry, setDraggedEntry] = useState<MaintenanceEntry | null>(null)
  const [dragOverCell, setDragOverCell] = useState<{ date: Date; equipmentId: string } | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ date: Date; equipmentId: string } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const timeSlots = useMemo(() => {
    switch (viewMode) {
      case 'day': {
        const dayStart = startOfDay(currentDate)
        return eachHourOfInterval({
          start: dayStart,
          end: addHours(dayStart, 23),
        })
      }
      case 'week': {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
        return eachDayOfInterval({ start: weekStart, end: weekEnd })
      }
      case 'month': {
        const monthStart = startOfMonth(currentDate)
        const monthEnd = endOfMonth(currentDate)
        return eachDayOfInterval({ start: monthStart, end: monthEnd })
      }
      case 'year': {
        const yearStart = startOfYear(currentDate)
        return eachMonthOfInterval({
          start: yearStart,
          end: new Date(currentDate.getFullYear(), 11, 31),
        })
      }
      default:
        return []
    }
  }, [viewMode, currentDate])

  const formatHeader = (date: Date): string => {
    switch (viewMode) {
      case 'day':
        return format(date, 'h aa')
      case 'week':
        return format(date, 'EEE d')
      case 'month':
        return format(date, 'd')
      case 'year':
        return format(date, 'MMM')
      default:
        return ''
    }
  }

  const viewRange = useMemo(() => {
    if (timeSlots.length === 0) return null
    return {
      start: timeSlots[0],
      end: viewMode === 'day' ? endOfDay(timeSlots[timeSlots.length - 1]) : 
            viewMode === 'year' ? endOfMonth(timeSlots[timeSlots.length - 1]) : 
            endOfDay(timeSlots[timeSlots.length - 1]),
    }
  }, [timeSlots, viewMode])

  const getEntriesForEquipment = useCallback(
    (equipmentId: string) => {
      if (!viewRange) return []
      
      return entries.filter((entry) => {
        if (entry.equipmentId !== equipmentId) return false
        
        const entryStart = new Date(entry.startTime)
        const entryEnd = new Date(entry.endTime)
        
        // Overlap check: (StartA <= EndB) and (EndA >= StartB)
        return entryStart <= viewRange.end && entryEnd >= viewRange.start
      })
    },
    [entries, viewRange]
  )

  const getEntryStartSlotIndex = (entry: MaintenanceEntry): number => {
    const entryStart = new Date(entry.startTime)
    
    // Find the first slot that contains or starts after the entry start
    let lastIndex = -1
    for (let i = 0; i < timeSlots.length; i++) {
      const slot = timeSlots[i]
      let isMatch = false
      
      switch (viewMode) {
        case 'day':
          isMatch = isSameHour(entryStart, slot) || entryStart > slot
          break
        case 'week':
        case 'month':
          isMatch = isSameDay(entryStart, slot) || entryStart > slot
          break
        case 'year':
          isMatch = isSameMonth(entryStart, slot) || entryStart > slot
          break
      }
      
      if (isMatch) {
        lastIndex = i
      } else {
        break
      }
    }

    if (lastIndex === -1 && entryStart < timeSlots[0]) return 0
    return lastIndex
  }

  const getEntrySpan = (entry: MaintenanceEntry): number => {
    const entryStart = new Date(entry.startTime)
    const entryEnd = new Date(entry.endTime)
    
    // Clamp start/end to view range for span calculation
    const effectiveStart = viewRange && entryStart < viewRange.start ? viewRange.start : entryStart
    const effectiveEnd = viewRange && entryEnd > viewRange.end ? viewRange.end : entryEnd

    switch (viewMode) {
      case 'day': {
        const hours = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60))
        return Math.max(1, hours)
      }
      case 'week':
      case 'month': {
        const days = differenceInDays(effectiveEnd, effectiveStart) + 1
        return Math.max(1, days)
      }
      case 'year': {
        const months = effectiveEnd.getMonth() - effectiveStart.getMonth() + 1
        return Math.max(1, months)
      }
      default:
        return 1
    }
  }

  const handleCellClick = (date: Date, equipmentId: string) => {
    setSelectedCell({ date, equipmentId })
    setAddDialogOpen(true)
  }

  const handleHeaderClick = (date: Date) => {
    if (viewMode === 'week' || viewMode === 'month') {
      setCurrentDate(date)
      setViewMode('day')
    }
  }

  const handleDragStart = (entry: MaintenanceEntry) => {
    setDraggedEntry(entry)
  }

  const handleDragOver = (e: React.DragEvent, date: Date, equipmentId: string) => {
    e.preventDefault()
    setDragOverCell({ date, equipmentId })
  }

  const handleDragLeave = () => {
    setDragOverCell(null)
  }

  const handleDrop = (date: Date, equipmentId: string) => {
    if (draggedEntry) {
      moveEntry(draggedEntry.id, date, equipmentId)
    }
    setDraggedEntry(null)
    setDragOverCell(null)
  }

  const isToday = (date: Date): boolean => {
    const today = new Date()
    switch (viewMode) {
      case 'day':
        return isSameHour(date, today)
      case 'week':
      case 'month':
        return isSameDay(date, today)
      case 'year':
        return isSameMonth(date, today)
      default:
        return false
    }
  }

  const cellWidth = viewMode === 'month' ? 'min-w-[40px]' : viewMode === 'year' ? 'min-w-[80px]' : 'min-w-[100px]'

  const totalTasksInView = useMemo(() => {
    return equipment.reduce((acc, equip) => acc + getEntriesForEquipment(equip.id).length, 0)
  }, [equipment, getEntriesForEquipment])

  return (
    <>
      <div ref={gridRef} className="flex-1 overflow-auto border border-border rounded-lg bg-card relative">
        {isLoading && (
          <div className="absolute inset-0 z-50 bg-background/50 flex items-center justify-center backdrop-blur-[1px]">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        <div className="min-w-max h-full flex flex-col">
          {/* Header row */}
          <div className="flex sticky top-0 z-20 bg-card border-b border-border flex-shrink-0">
            <div className="w-48 min-w-48 sticky left-0 z-30 bg-card border-r border-border p-3 font-medium text-sm text-muted-foreground">
              Equipment
            </div>
            <div className="flex">
              {timeSlots.map((slot, idx) => (
                <div
                  key={idx}
                  onClick={() => handleHeaderClick(slot)}
                  className={cn(
                    cellWidth,
                    'flex-1 p-2 text-center text-sm font-medium border-r border-border text-muted-foreground transition-colors',
                    (viewMode === 'week' || viewMode === 'month') && 'cursor-pointer hover:bg-accent hover:text-foreground',
                    isToday(slot) && 'bg-primary/10 text-primary'
                  )}
                >
                  {formatHeader(slot)}
                </div>
              ))}
            </div>
          </div>

          {/* Equipment rows */}
          <div className="flex-1 overflow-y-auto">
            {equipment.length > 0 ? (
              equipment.map((equip) => {
                const equipEntries = getEntriesForEquipment(equip.id)
                
                return (
                  <div key={equip.id} className="flex border-b border-border last:border-b-0 group">
                    {/* Equipment name cell */}
                    <div className="w-48 min-w-48 sticky left-0 z-10 bg-card border-r border-border p-3 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Box className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate max-w-32">
                          {equip.name}
                        </div>
                        {equip.category && <div className="text-xs text-muted-foreground truncate max-w-32">{equip.category}</div>}
                      </div>
                    </div>

                    {/* Timeline cells */}
                    <div className="flex relative">
                      {timeSlots.map((slot, slotIdx) => {
                        const isDragOver = dragOverCell && 
                          dragOverCell.equipmentId === equip.id && 
                          (viewMode === 'day' ? isSameHour(dragOverCell.date, slot) : isSameDay(dragOverCell.date, slot))

                        return (
                          <div
                            key={slotIdx}
                            className={cn(
                              cellWidth,
                              'flex-1 h-16 border-r border-border cursor-pointer transition-colors relative',
                              'hover:bg-accent/50',
                              isDragOver && 'bg-primary/20',
                              isToday(slot) && 'bg-primary/5'
                            )}
                            onClick={() => handleCellClick(slot, equip.id)}
                            onDragOver={(e) => handleDragOver(e, slot, equip.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={() => handleDrop(slot, equip.id)}
                          />
                        )
                      })}

                      {/* Render entries as overlay */}
                      {!isLoading && equipEntries.map((entry) => {
                        const startIdx = getEntryStartSlotIndex(entry)
                        if (startIdx < 0) return null

                        const span = getEntrySpan(entry)
                        const cellWidthPx = viewMode === 'month' ? 40 : viewMode === 'year' ? 80 : 100
                        const left = startIdx * cellWidthPx
                        const width = Math.min(span, timeSlots.length - startIdx) * cellWidthPx - 4

                        return (
                          <MaintenanceEntryBlock
                            key={entry.id}
                            entry={entry}
                            style={{
                              position: 'absolute',
                              left: `${left + 2}px`,
                              width: `${width}px`,
                              top: '4px',
                              height: 'calc(100% - 8px)',
                            }}
                            onDragStart={() => handleDragStart(entry)}
                            isDragging={draggedEntry?.id === entry.id}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="p-8 text-center text-muted-foreground italic">
                No equipment registered.
              </div>
            )}
            
            {viewMode === 'day' && !isLoading && totalTasksInView === 0 && (
              <div className="sticky left-0 right-0 p-4 text-center text-sm text-muted-foreground bg-muted/20 border-b border-border">
                No tasks scheduled for this day.
              </div>
            )}
          </div>
        </div>
      </div>

      <AddEntryDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        selectedCell={selectedCell}
      />
    </>
  )
}
