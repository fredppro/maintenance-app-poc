'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TimePicker } from '@/components/ui/time-picker'
import { useSchedulerStore } from '@/lib/scheduler-store'
import { MaintenanceEntry } from '@/lib/scheduler-types'
import { cn } from '@/lib/utils'
import { addMinutes, format, set } from 'date-fns'
import { CalendarIcon, GripVertical, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { TaskType } from '../../generated/prisma/enums'

interface MaintenanceEntryBlockProps {
  entry: MaintenanceEntry
  style?: React.CSSProperties
  onDragStart: () => void
  isDragging?: boolean
  timeSlotsCount: number
}

export function MaintenanceEntryBlock({
  entry,
  style,
  onDragStart,
  isDragging,
  timeSlotsCount,
}: MaintenanceEntryBlockProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [workerIds, setWorkerIds] = useState<string[]>([])
  const [type, setType] = useState<TaskType>(entry.type)
  const [isUpdating, setIsUpdating] = useState(false)
  
  // Edit state for the dialog
  const [editStartTime, setEditStartTime] = useState<Date>(new Date(entry.startTime))
  const [editEndTime, setEditEndTime] = useState<Date>(new Date(entry.endTime))
  
  const { equipment, workers, removeEntry, updateEntry, viewMode } = useSchedulerStore()
  
  const equip = equipment.find((e) => e.id === entry.equipmentId)
  const assignedWorkers = entry.assignments?.map(a => a.worker) || []

  // Resize state
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null)
  const [resizeOffset, setResizeOffset] = useState(0)
  const entryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (detailsOpen) {
      setWorkerIds(entry.assignments?.map(a => a.workerId) || [])
      setType(entry.type)
      setEditStartTime(new Date(entry.startTime))
      setEditEndTime(new Date(entry.endTime))
    }
  }, [detailsOpen, entry])

  const getStatusBadge = () => {
    switch (entry.status) {
      case 'scheduled':
        return <Badge variant="secondary" className="text-xs">Scheduled</Badge>
      case 'in-progress':
        return <Badge className="bg-chart-3/20 text-chart-3 border-chart-3/40 text-xs">In Progress</Badge>
      case 'completed':
        return <Badge className="bg-chart-1/20 text-chart-1 border-chart-1/40 text-xs">Completed</Badge>
      default:
        return <Badge variant="outline" className="text-xs">{entry.status}</Badge>
    }
  }

  const getTypeStyles = () => {
    switch (entry.type) {
      case TaskType.PREVENTIVE:
        return 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
      case TaskType.INSPECTION:
        return 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
      case TaskType.CORRECTIVE:
        return 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
      default:
        return 'bg-primary/10 border-primary/20 text-primary'
    }
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (isResizing) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = 'move'
    onDragStart()
  }

  const handleClick = (e: React.MouseEvent) => {
    // If we were resizing, don't open the dialog
    if (isResizing) return
    
    e.stopPropagation()
    setDetailsOpen(true)
  }

  const handleDelete = async () => {
    try {
      await removeEntry(entry.id)
      setDetailsOpen(false)
      toast.success('Entry deleted')
    } catch (error) {
      toast.error('Failed to delete entry')
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateEntry(entry.id, { status: newStatus })
    } catch (error) {
      toast.error('Failed to update status')
    }
  }

  const handleSaveEdit = async () => {
    if (workerIds.length === 0) {
      toast.error('At least one worker must be assigned')
      return
    }
    if (editEndTime <= editStartTime) {
      toast.error('End time must be after start time')
      return
    }

    setIsUpdating(true)
    try {
      await updateEntry(entry.id, {
        workerIds,
        type,
        startTime: editStartTime,
        endTime: editEndTime,
      })
      toast.success('Task updated successfully')
      setDetailsOpen(false)
    } catch (error) {
      toast.error('Failed to update task')
    } finally {
      setIsUpdating(false)
    }
  }

  // --- Resizing Logic ---
  
  const handleResizeStart = (type: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsResizing(type)
    setResizeOffset(0)

    const startX = e.clientX
    const containerWidth = entryRef.current?.parentElement?.getBoundingClientRect().width || 1000
    const pixelsPerSlot = containerWidth / timeSlotsCount

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      setResizeOffset(deltaX)
    }

    const onMouseUp = async (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      
      const finalDeltaX = upEvent.clientX - startX
      // Keep isResizing state briefly to prevent handleClick from opening dialog
      setTimeout(() => setIsResizing(null), 100)
      setResizeOffset(0)

      if (Math.abs(finalDeltaX) < 5) return

      // Calculate time change based on viewMode
      let pixelsPerMinute = 0
      if (viewMode === 'day') pixelsPerMinute = pixelsPerSlot / 60
      else if (viewMode === 'week') pixelsPerMinute = pixelsPerSlot / (24 * 60)
      else if (viewMode === 'month') pixelsPerMinute = pixelsPerSlot / (24 * 60)
      else if (viewMode === 'year') pixelsPerMinute = pixelsPerSlot / (30 * 24 * 60) 

      const minutesChange = finalDeltaX / pixelsPerMinute
      
      // Snapping
      let snappedMinutes = minutesChange
      if (viewMode === 'day') {
        snappedMinutes = Math.round(minutesChange / 15) * 15
      } else {
        snappedMinutes = Math.round(minutesChange / (24 * 60)) * (24 * 60)
      }

      if (snappedMinutes === 0) return

      const newStartTime = new Date(entry.startTime)
      const newEndTime = new Date(entry.endTime)

      if (type === 'start') {
        const potentialStart = addMinutes(newStartTime, snappedMinutes)
        if (potentialStart < newEndTime) {
          await updateEntry(entry.id, { startTime: potentialStart })
        }
      } else {
        const potentialEnd = addMinutes(newEndTime, snappedMinutes)
        if (potentialEnd > newStartTime) {
          await updateEntry(entry.id, { endTime: potentialEnd })
        }
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
  }

  const workerOptions = workers.map(w => ({
    label: `${w.name} (${w.email})`,
    value: w.id
  }))

  const visualStyle = {
    ...style,
    ...(isResizing === 'start' ? {
      left: `calc(${style?.left || '0px'} + ${resizeOffset}px)`,
      width: `calc(${style?.width || '0px'} - ${resizeOffset}px)`,
    } : {}),
    ...(isResizing === 'end' ? {
      width: `calc(${style?.width || '0px'} + ${resizeOffset}px)`,
    } : {}),
  }

  return (
    <>
      <div
        ref={entryRef}
        draggable={!isResizing}
        onDragStart={handleDragStart}
        onClick={handleClick}
        style={visualStyle}
        className={cn(
          'rounded-md border px-2 py-1 cursor-grab active:cursor-grabbing group select-none',
          'flex items-center gap-1 overflow-hidden transition-[background-color,border-color,ring]',
          'hover:ring-2 hover:ring-ring hover:ring-offset-1 hover:ring-offset-background',
          getTypeStyles(),
          isDragging && 'opacity-50 scale-95',
          isResizing && 'cursor-col-resize ring-2 ring-primary border-primary/50 z-50'
        )}
      >
        {/* Left Resize Handle */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => handleResizeStart('start', e)}
        />

        <GripVertical className="w-3 h-3 flex-shrink-0 opacity-50" />
        <Wrench className="w-3 h-3 flex-shrink-0" />
        <span className="text-xs font-medium truncate flex-1">{entry.title}</span>
        
        {/* Initials stack */}
        <div className="flex -space-x-2 overflow-hidden">
          {assignedWorkers.slice(0, 2).map((worker) => (
            <div 
              key={worker.id}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-background bg-primary text-[8px] font-bold text-primary-foreground"
              title={worker.name}
            >
              {getInitials(worker.name)}
            </div>
          ))}
          {assignedWorkers.length > 2 && (
            <div className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-background bg-muted text-[8px] font-bold text-muted-foreground">
              +{assignedWorkers.length - 2}
            </div>
          )}
        </div>

        {/* Right Resize Handle */}
        <div 
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => handleResizeStart('end', e)}
        />
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Edit: {entry.title}
            </DialogTitle>
            <DialogDescription>
              {equip?.name} {equip?.category ? `- ${equip.category}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[75vh] overflow-y-auto px-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">Status</span>
              {getStatusBadge()}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Start Date & Time</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1 justify-start text-left font-normal text-xs h-9">
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {format(editStartTime, "PP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={editStartTime}
                        onSelect={(date) => date && setEditStartTime(set(editStartTime, {
                          year: date.getFullYear(),
                          month: date.getMonth(),
                          date: date.getDate()
                        }))}
                      />
                    </PopoverContent>
                  </Popover>
                  <TimePicker date={editStartTime} onChange={setEditStartTime} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">End Date & Time</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1 justify-start text-left font-normal text-xs h-9">
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {format(editEndTime, "PP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={editEndTime}
                        onSelect={(date) => date && setEditEndTime(set(editEndTime, {
                          year: date.getFullYear(),
                          month: date.getMonth(),
                          date: date.getDate()
                        }))}
                      />
                    </PopoverContent>
                  </Popover>
                  <TimePicker date={editEndTime} onChange={setEditEndTime} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Task Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TaskType.PREVENTIVE}>Preventive</SelectItem>
                  <SelectItem value={TaskType.INSPECTION}>Inspection</SelectItem>
                  <SelectItem value={TaskType.CORRECTIVE}>Corrective</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Assigned Workers</Label>
              <MultiSelect
                options={workerOptions}
                selected={workerIds}
                onChange={setWorkerIds}
                placeholder="Select workers..."
              />
            </div>

            <div className="border-t pt-4 space-y-2">
              <span className="text-sm text-muted-foreground font-medium">Quick Status Update</span>
              <div className="flex gap-2">
                {['scheduled', 'in-progress', 'completed'].map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    className="flex-1 capitalize text-xs h-8"
                    variant={entry.status === status ? 'default' : 'outline'}
                    onClick={() => handleStatusChange(status)}
                  >
                    {status.replace('-', ' ')}
                  </Button>
                ))}
              </div>
            </div>

            <Button 
              size="sm" 
              className="w-full h-10 mt-4"
              onClick={handleSaveEdit}
              disabled={isUpdating}
            >
              {isUpdating ? 'Saving...' : 'Save All Changes'}
            </Button>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0 mt-4 border-t pt-4">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              Delete Entry
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
