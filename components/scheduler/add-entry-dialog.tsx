'use client'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
import { Textarea } from '@/components/ui/textarea'
import { TimePicker } from '@/components/ui/time-picker'
import { useSchedulerStore } from '@/lib/scheduler-store'
import { cn } from '@/lib/utils'
import { TaskType } from '../../generated/prisma/enums'
import { addHours, format, set } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface AddEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCell: { date: Date; equipmentId: string } | null
}

export function AddEntryDialog({ open, onOpenChange, selectedCell }: AddEntryDialogProps) {
  const { addEntry, equipment, workers, viewMode } = useSchedulerStore()
  
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<TaskType>(TaskType.PREVENTIVE)
  const [equipmentId, setEquipmentId] = useState('')
  const [startTime, setStartTime] = useState<Date>(new Date())
  const [endTime, setEndTime] = useState<Date>(new Date())
  const [workerIds, setWorkerIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (selectedCell) {
      setEquipmentId(selectedCell.equipmentId)
      const start = new Date(selectedCell.date)
      setStartTime(start)
      setEndTime(addHours(start, 1))
    }
  }, [selectedCell])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedCell || !title.trim() || !equipmentId || workerIds.length === 0) {
      if (workerIds.length === 0) {
        toast.error('Please select at least one worker')
      }
      return
    }

    if (endTime <= startTime) {
      toast.error('End time must be after start time')
      return
    }

    const entryData = {
      equipmentId,
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      startTime,
      endTime,
      workerIds,
      status: 'scheduled',
    }

    setIsSubmitting(true)
    try {
      await addEntry(entryData)
      toast.success('Maintenance scheduled successfully')
      
      // Reset form
      setTitle('')
      setDescription('')
      setType(TaskType.PREVENTIVE)
      setWorkerIds([])
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to add entry:', error)
      toast.error('Failed to schedule maintenance')
    } finally {
      setIsSubmitting(false)
    }
  }

  const workerOptions = workers.map(w => ({
    label: `${w.name} (${w.email})`,
    value: w.id
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
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
              <FieldLabel>Task Type</FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TaskType.PREVENTIVE}>Preventive</SelectItem>
                  <SelectItem value={TaskType.INSPECTION}>Inspection</SelectItem>
                  <SelectItem value={TaskType.CORRECTIVE}>Corrective</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Start Date & Time</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal h-9",
                          !startTime && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startTime ? format(startTime, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startTime}
                        onSelect={(date) => date && setStartTime(set(startTime, {
                          year: date.getFullYear(),
                          month: date.getMonth(),
                          date: date.getDate()
                        }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <TimePicker date={startTime} onChange={setStartTime} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">End Date & Time</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal h-9",
                          !endTime && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endTime ? format(endTime, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endTime}
                        onSelect={(date) => date && setEndTime(set(endTime, {
                          year: date.getFullYear(),
                          month: date.getMonth(),
                          date: date.getDate()
                        }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <TimePicker date={endTime} onChange={setEndTime} />
                </div>
              </div>
            </div>

            <Field>
              <FieldLabel>Description (optional)</FieldLabel>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details about this maintenance task..."
                rows={2}
              />
            </Field>

            <Field>
              <FieldLabel>Assigned Workers</FieldLabel>
              <MultiSelect
                options={workerOptions}
                selected={workerIds}
                onChange={setWorkerIds}
                placeholder="Select workers..."
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || !equipmentId || workerIds.length === 0 || isSubmitting}>
              {isSubmitting ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
