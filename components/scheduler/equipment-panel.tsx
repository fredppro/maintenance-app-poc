'use client'

import { useSchedulerStore } from '@/lib/scheduler-store'
import { Equipment } from '@/lib/scheduler-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreVertical, Trash2, Settings } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'

export function EquipmentPanel() {
  const { equipment, addEquipment, removeEquipment, entries } = useSchedulerStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<Equipment['status']>('active')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !category.trim()) return

    addEquipment({
      name: name.trim(),
      category: category.trim(),
      status,
    })

    setName('')
    setCategory('')
    setStatus('active')
    setDialogOpen(false)
  }

  const getMaintenanceCount = (equipmentId: string) => {
    return entries.filter(
      (e) => e.equipmentId === equipmentId && e.status !== 'completed'
    ).length
  }

  const categories = [...new Set(equipment.map((e) => e.category))]

  return (
    <div className="w-72 bg-card border border-border rounded-lg flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Equipment</h2>
          <p className="text-sm text-muted-foreground">{equipment.length} registered</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Equipment</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Equipment Name</FieldLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., CNC Machine G7"
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel>Category</FieldLabel>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g., Manufacturing"
                    list="categories"
                    required
                  />
                  <datalist id="categories">
                    {categories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </Field>

                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <Select value={status} onValueChange={(v) => setStatus(v as Equipment['status'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="maintenance">Under Maintenance</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!name.trim() || !category.trim()}>
                  Add Equipment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Equipment List */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {equipment.map((equip) => {
          const pendingCount = getMaintenanceCount(equip.id)
          
          return (
            <div
              key={equip.id}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 group transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    equip.status === 'active' && 'bg-chart-1',
                    equip.status === 'maintenance' && 'bg-chart-3',
                    equip.status === 'inactive' && 'bg-muted-foreground'
                  )}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {equip.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{equip.category}</span>
                    {pendingCount > 0 && (
                      <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-xs">
                        {pendingCount} pending
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="gap-2">
                    <Settings className="w-4 h-4" />
                    Edit Equipment
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 text-destructive focus:text-destructive"
                    onClick={() => removeEquipment(equip.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-border space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Status Legend
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-chart-1" />
            <span className="text-muted-foreground">Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-chart-3" />
            <span className="text-muted-foreground">Maintenance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">Inactive</span>
          </div>
        </div>
      </div>
    </div>
  )
}
