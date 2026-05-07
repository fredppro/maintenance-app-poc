'use client'

import { MaintenanceEntry } from '@/lib/scheduler-types'
import { cn } from '@/lib/utils'
import { Wrench, Search, AlertTriangle, GripVertical, Mail, Users } from 'lucide-react'
import { useSchedulerStore } from '@/lib/scheduler-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { MultiSelect } from '@/components/ui/multi-select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface MaintenanceEntryBlockProps {
  entry: MaintenanceEntry
  style?: React.CSSProperties
  onDragStart: () => void
  isDragging?: boolean
}

export function MaintenanceEntryBlock({
  entry,
  style,
  onDragStart,
  isDragging,
}: MaintenanceEntryBlockProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [workerIds, setWorkerIds] = useState<string[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  
  const { equipment, workers, removeEntry, updateEntry } = useSchedulerStore()
  
  const equip = equipment.find((e) => e.id === entry.equipmentId)
  const assignedWorkers = entry.assignments?.map(a => a.worker) || []

  useEffect(() => {
    if (detailsOpen) {
      setWorkerIds(entry.assignments?.map(a => a.workerId) || [])
    }
  }, [detailsOpen, entry.assignments])

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

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    onDragStart()
  }

  const handleClick = (e: React.MouseEvent) => {
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

  const handleUpdateWorkers = async () => {
    if (workerIds.length === 0) {
      toast.error('At least one worker must be assigned')
      return
    }

    setIsUpdating(true)
    try {
      await updateEntry(entry.id, {
        workerIds: workerIds,
      })
      toast.success('Worker assignments updated')
    } catch (error) {
      toast.error('Failed to update worker assignments')
    } finally {
      setIsUpdating(false)
    }
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

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        style={style}
        className={cn(
          'rounded-md border px-2 py-1 cursor-grab active:cursor-grabbing',
          'flex items-center gap-1 overflow-hidden transition-all relative',
          'hover:ring-2 hover:ring-ring hover:ring-offset-1 hover:ring-offset-background',
          'bg-primary/10 border-primary/20 text-primary',
          isDragging && 'opacity-50 scale-95'
        )}
      >
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
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              {entry.title}
            </DialogTitle>
            <DialogDescription>
              {equip?.name} {equip?.category ? `- ${equip.category}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              {getStatusBadge()}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Start Time</span>
              <span className="text-sm">{format(new Date(entry.startTime), 'PPp')}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">End Time</span>
              <span className="text-sm">{format(new Date(entry.endTime), 'PPp')}</span>
            </div>

            {entry.description && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Description</span>
                <p className="text-sm bg-muted/50 p-3 rounded-md">{entry.description}</p>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Assigned Workers
              </h4>
              
              <MultiSelect
                options={workerOptions}
                selected={workerIds}
                onChange={setWorkerIds}
                placeholder="Select workers..."
              />
              
              <Button 
                size="sm" 
                variant="secondary" 
                className="w-full"
                onClick={handleUpdateWorkers}
                disabled={isUpdating || workerIds.length === 0}
              >
                {isUpdating ? 'Updating...' : 'Update Assignments'}
              </Button>
            </div>

            <div className="border-t pt-4 space-y-2">
              <span className="text-sm text-muted-foreground">Update Status:</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  variant={entry.status === 'scheduled' ? 'default' : 'outline'}
                  onClick={() => handleStatusChange('scheduled')}
                >
                  Scheduled
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  variant={entry.status === 'in-progress' ? 'default' : 'outline'}
                  onClick={() => handleStatusChange('in-progress')}
                >
                  In Progress
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  variant={entry.status === 'completed' ? 'default' : 'outline'}
                  onClick={() => handleStatusChange('completed')}
                >
                  Completed
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="destructive" onClick={handleDelete}>
              Delete Entry
            </Button>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
