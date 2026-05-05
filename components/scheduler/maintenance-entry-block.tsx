'use client'

import { MaintenanceEntry } from '@/lib/scheduler-types'
import { cn } from '@/lib/utils'
import { Wrench, Search, AlertTriangle, GripVertical, Mail } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

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
  const [workerName, setWorkerName] = useState(entry.assignedWorkerName || '')
  const [workerEmail, setWorkerEmail] = useState(entry.assignedWorkerEmail || '')
  const [isNotifying, setIsNotifying] = useState(false)
  
  const { equipment, removeEntry, updateEntry } = useSchedulerStore()
  
  const equip = equipment.find((e) => e.id === entry.equipmentId)

  useEffect(() => {
    if (detailsOpen) {
      setWorkerName(entry.assignedWorkerName || '')
      setWorkerEmail(entry.assignedWorkerEmail || '')
    }
  }, [detailsOpen, entry.assignedWorkerName, entry.assignedWorkerEmail])

  const getTypeIcon = () => {
    switch (entry.type) {
      case 'preventive':
        return <Wrench className="w-3 h-3" />
      case 'inspection':
        return <Search className="w-3 h-3" />
      case 'corrective':
        return <AlertTriangle className="w-3 h-3" />
    }
  }

  const getTypeColor = () => {
    switch (entry.type) {
      case 'preventive':
        return 'bg-chart-1/20 border-chart-1/40 text-chart-1'
      case 'inspection':
        return 'bg-chart-2/20 border-chart-2/40 text-chart-2'
      case 'corrective':
        return 'bg-chart-3/20 border-chart-3/40 text-chart-3'
    }
  }

  const getStatusBadge = () => {
    switch (entry.status) {
      case 'scheduled':
        return <Badge variant="secondary" className="text-xs">Scheduled</Badge>
      case 'in-progress':
        return <Badge className="bg-chart-3/20 text-chart-3 border-chart-3/40 text-xs">In Progress</Badge>
      case 'completed':
        return <Badge className="bg-chart-1/20 text-chart-1 border-chart-1/40 text-xs">Completed</Badge>
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

  const handleDelete = () => {
    removeEntry(entry.id)
    setDetailsOpen(false)
  }

  const handleStatusChange = (newStatus: MaintenanceEntry['status']) => {
    updateEntry(entry.id, { status: newStatus })
  }

  const handleUpdateWorker = () => {
    updateEntry(entry.id, {
      assignedWorkerName: workerName.trim() || undefined,
      assignedWorkerEmail: workerEmail.trim() || undefined,
    })
    toast.success('Worker details updated')
  }

  const handleNotifyWorker = async () => {
    if (!workerEmail.trim()) {
      toast.error('Worker email is required to send notification')
      return
    }

    setIsNotifying(true)
    try {
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: entry,
          worker: { name: workerName, email: workerEmail },
          equipment: equip
        }),
      })
      
      if (response.ok) {
        toast.success('Notification sent to worker')
      } else {
        toast.error('Failed to send notification')
      }
    } catch (error) {
      console.error('Failed to send notification:', error)
      toast.error('Error sending notification')
    } finally {
      setIsNotifying(false)
    }
  }

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        style={style}
        className={cn(
          'rounded-md border px-2 py-1 cursor-grab active:cursor-grabbing',
          'flex items-center gap-1 overflow-hidden transition-all',
          'hover:ring-2 hover:ring-ring hover:ring-offset-1 hover:ring-offset-background',
          getTypeColor(),
          isDragging && 'opacity-50 scale-95'
        )}
      >
        <GripVertical className="w-3 h-3 flex-shrink-0 opacity-50" />
        {getTypeIcon()}
        <span className="text-xs font-medium truncate">{entry.title}</span>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getTypeIcon()}
              {entry.title}
            </DialogTitle>
            <DialogDescription>
              {equip?.name} - {equip?.category}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              {getStatusBadge()}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Type</span>
              <Badge variant="outline" className="capitalize">{entry.type}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Start Date</span>
              <span className="text-sm">{format(entry.startDate, 'PPp')}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">End Date</span>
              <span className="text-sm">{format(entry.endDate, 'PPp')}</span>
            </div>

            {entry.description && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Description</span>
                <p className="text-sm bg-muted/50 p-3 rounded-md">{entry.description}</p>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-medium">Assigned Worker</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="worker-name" className="text-xs">Name</Label>
                  <Input
                    id="worker-name"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="John Doe"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="worker-email" className="text-xs">Email</Label>
                  <Input
                    id="worker-email"
                    type="email"
                    value={workerEmail}
                    onChange={(e) => setWorkerEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="secondary" 
                  className="w-full"
                  onClick={handleUpdateWorker}
                >
                  Update Details
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full gap-2"
                  onClick={handleNotifyWorker}
                  disabled={isNotifying || !workerEmail.trim()}
                >
                  <Mail className="w-3 h-3" />
                  {isNotifying ? 'Sending...' : 'Notify Worker'}
                </Button>
              </div>
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
