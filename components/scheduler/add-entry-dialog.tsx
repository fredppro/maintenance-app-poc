'use client'

import { useSchedulerStore } from '@/lib/scheduler-store'
import { MaintenanceEntry } from '@/lib/scheduler-types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format, addDays, addHours } from 'date-fns'
import { useState, useEffect } from 'react'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { toast } from 'sonner'

interface AddEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCell: { date: Date; equipmentId: string } | null
}

export function AddEntryDialog({ open, onOpenChange, selectedCell }: AddEntryDialogProps) {
  const { addEntry, equipment, viewMode } = useSchedulerStore()
  
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<MaintenanceEntry['type']>('preventive')
  const [equipmentId, setEquipmentId] = useState('')
  const [duration, setDuration] = useState('1')
  const [workerName, setWorkerName] = useState('')
  const [workerEmail, setWorkerEmail] = useState('')
  const [shouldNotify, setShouldNotify] = useState(false)
  const [isNotifying, setIsNotifying] = useState(false)

  useEffect(() => {
    if (selectedCell) {
      setEquipmentId(selectedCell.equipmentId)
    }
  }, [selectedCell])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedCell || !title.trim()) return

    const startDate = selectedCell.date
    let endDate: Date

    if (viewMode === 'day') {
      endDate = addHours(startDate, parseInt(duration) || 1)
    } else {
      endDate = addDays(startDate, (parseInt(duration) || 1) - 1)
    }

    const entryData: Omit<MaintenanceEntry, 'id'> = {
      equipmentId,
      title: title.trim(),
      description: description.trim() || undefined,
      startDate,
      endDate,
      type,
      status: 'scheduled',
      assignedWorkerName: workerName.trim() || undefined,
      assignedWorkerEmail: workerEmail.trim() || undefined,
    }

    addEntry(entryData)

    if (shouldNotify && workerEmail.trim()) {
      setIsNotifying(true)
      try {
        const equip = equipment.find(e => e.id === equipmentId)
        const response = await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: entryData,
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

    // Reset form
    setTitle('')
    setDescription('')
    setType('preventive')
    setDuration('1')
    setWorkerName('')
    setWorkerEmail('')
    setShouldNotify(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Maintenance</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 -mx-4 max-h-[75vh] overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Equipment</FieldLabel>
              <Select value={equipmentId} onValueChange={setEquipmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  {equipment.map((equip) => (
                    <SelectItem key={equip.id} value={equip.id}>
                      {equip.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Title</FieldLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Monthly Inspection"
                required
              />
            </Field>

            <Field>
              <FieldLabel>Maintenance Type</FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as MaintenanceEntry['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventive">Preventive</SelectItem>
                  <SelectItem value="corrective">Corrective</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Start Date</FieldLabel>
                <Input
                  type="text"
                  value={selectedCell ? format(selectedCell.date, viewMode === 'day' ? 'PPp' : 'PP') : ''}
                  disabled
                  className="bg-muted"
                />
              </Field>

              <Field>
                <FieldLabel>Duration ({viewMode === 'day' ? 'hours' : 'days'})</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Description (optional)</FieldLabel>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details about this maintenance task..."
                rows={3}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>Worker Name</FieldLabel>
                <Input
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  placeholder="John Doe"
                />
              </Field>

              <Field>
                <FieldLabel>Worker Email</FieldLabel>
                <Input
                  type="email"
                  value={workerEmail}
                  onChange={(e) => setWorkerEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </Field>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="notify"
                checked={shouldNotify}
                onChange={(e) => setShouldNotify(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                disabled={!workerEmail.trim()}
              />
              <label
                htmlFor="notify"
                className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${!workerEmail.trim() ? 'opacity-50' : ''}`}
              >
                Notify worker via email
              </label>
            </div>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || !equipmentId || isNotifying}>
              {isNotifying ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
