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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { TimePicker } from '@/components/ui/time-picker'
import { useSchedulerStore } from '@/lib/scheduler-store'
import { cn } from '@/lib/utils'
import { TaskType } from '../../generated/prisma/enums'
import { zodResolver } from '@hookform/resolvers/zod'
import { addHours, format, set } from 'date-fns'
import { enUS, pt } from 'date-fns/locale'
import { CalendarIcon, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import * as z from 'zod'
import { useLocale, useTranslations } from 'next-intl'

const materialSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  reference: z.string().optional(),
  quantity: z.number().min(0.1, 'Quantity must be > 0').multipleOf(0.1, 'Only one decimal place allowed'),
})

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  type: z.nativeEnum(TaskType),
  equipmentId: z.string().min(1, 'Equipment is required'),
  startTime: z.date(),
  endTime: z.date(),
  workerIds: z.array(z.string()).min(1, 'Select at least one worker'),
  materials: z.array(materialSchema).optional(),
})

type FormValues = z.infer<typeof formSchema>

interface AddEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCell: { date: Date; equipmentId: string } | null
}

export function AddEntryDialog({ open, onOpenChange, selectedCell }: AddEntryDialogProps) {
  const { addEntry, equipment, workers } = useSchedulerStore()
  const locale = useLocale()
  const t = useTranslations('Form')
  const tCommon = useTranslations('Common')
  
  const dateFnsLocale = useMemo(() => {
    return locale === 'pt-pt' ? pt : enUS
  }, [locale])
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      type: TaskType.PREVENTIVE,
      equipmentId: '',
      startTime: new Date(),
      endTime: addHours(new Date(), 1),
      workerIds: [],
      materials: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'materials',
  })

  useEffect(() => {
    if (selectedCell && open) {
      form.setValue('equipmentId', selectedCell.equipmentId)
      const start = new Date(selectedCell.date)
      form.setValue('startTime', start)
      form.setValue('endTime', addHours(start, 1))
    }
  }, [selectedCell, open, form])

  const onSubmit = async (values: FormValues) => {
    if (values.endTime <= values.startTime) {
      toast.error(t('errors.endAfterStart'))
      return
    }

    try {
      await addEntry({
        ...values,
        status: 'scheduled',
      })
      toast.success(t('errors.success'))
      form.reset()
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to add entry:', error)
      toast.error(t('errors.failure'))
    }
  }

  const workerOptions = workers.map(w => ({
    label: `${w.name} (${w.email})`,
    value: w.id
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl lg:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('schedule')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 -mx-4 max-h-[75vh] overflow-y-auto px-4">
          <FieldGroup>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <FieldLabel>{t('equipment')}</FieldLabel>
                <Select 
                  value={form.watch('equipmentId')} 
                  onValueChange={(v) => form.setValue('equipmentId', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectEquipment')} />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment.map((equip) => (
                      <SelectItem key={equip.id} value={equip.id}>
                        {equip.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.equipmentId && (
                  <p className="text-xs text-destructive">{form.formState.errors.equipmentId.message}</p>
                )}
              </Field>

              <Field>
                <FieldLabel>{t('taskType')}</FieldLabel>
                <Select 
                  value={form.watch('type')} 
                  onValueChange={(v) => form.setValue('type', v as TaskType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectType')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TaskType.PREVENTIVE}>{t('preventive')}</SelectItem>
                    <SelectItem value={TaskType.INSPECTION}>{t('inspection')}</SelectItem>
                    <SelectItem value={TaskType.CORRECTIVE}>{t('corrective')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel>{t('title')}</FieldLabel>
              <Input
                {...form.register('title')}
                placeholder={t('titlePlaceholder')}
              />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">{t('startDateTime')}</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal h-9 px-2",
                          !form.watch('startTime') && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {form.watch('startTime') ? format(form.watch('startTime'), "PPP", { locale: dateFnsLocale }) : <span>{t('pickDate')}</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={form.watch('startTime')}
                        onSelect={(date) => date && form.setValue('startTime', set(form.getValues('startTime'), {
                          year: date.getFullYear(),
                          month: date.getMonth(),
                          date: date.getDate()
                        }))}
                        initialFocus
                        locale={dateFnsLocale}
                      />
                    </PopoverContent>
                  </Popover>
                  <TimePicker 
                    date={form.watch('startTime')} 
                    onChange={(d) => form.setValue('startTime', d)} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">{t('endDateTime')}</Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal h-9 px-2",
                          !form.watch('endTime') && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {form.watch('endTime') ? format(form.watch('endTime'), "PPP", { locale: dateFnsLocale }) : <span>{t('pickDate')}</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={form.watch('endTime')}
                        onSelect={(date) => date && form.setValue('endTime', set(form.getValues('endTime'), {
                          year: date.getFullYear(),
                          month: date.getMonth(),
                          date: date.getDate()
                        }))}
                        initialFocus
                        locale={dateFnsLocale}
                      />
                    </PopoverContent>
                  </Popover>
                  <TimePicker 
                    date={form.watch('endTime')} 
                    onChange={(d) => form.setValue('endTime', d)} 
                  />
                </div>
              </div>
            </div>

            <Field>
              <FieldLabel>{t('description')}</FieldLabel>
              <Textarea
                {...form.register('description')}
                placeholder={t('descriptionPlaceholder')}
                rows={2}
              />
            </Field>

            <Field>
              <FieldLabel>{t('assignedWorkers')}</FieldLabel>
              <MultiSelect
                options={workerOptions}
                selected={form.watch('workerIds')}
                onChange={(v) => form.setValue('workerIds', v)}
                placeholder={t('selectWorkers')}
              />
              {form.formState.errors.workerIds && (
                <p className="text-xs text-destructive">{form.formState.errors.workerIds.message}</p>
              )}
            </Field>

            <div className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold">{t('materials')}</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="h-8 gap-1"
                  onClick={() => append({ name: '', reference: '', quantity: 1 })}
                >
                  <Plus className="h-4 w-4" />
                  {t('addMaterial')}
                </Button>
              </div>

              {fields.length > 0 ? (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[45%]">{t('itemName')}</TableHead>
                        <TableHead className="w-[25%]">{t('reference')}</TableHead>
                        <TableHead className="w-[20%] text-right">{t('quantity')}</TableHead>
                        <TableHead className="w-[10%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field, index) => (
                        <TableRow key={field.id} className="group">
                          <TableCell className="p-2">
                            <Input
                              {...form.register(`materials.${index}.name` as const)}
                              placeholder={t('itemName')}
                              className="h-8 text-xs"
                            />
                            {form.formState.errors.materials?.[index]?.name && (
                              <p className="text-[10px] text-destructive mt-1">
                                {form.formState.errors.materials[index]?.name?.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="p-2">
                            <Input
                              {...form.register(`materials.${index}.reference` as const)}
                              placeholder={t('reference')}
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell className="p-2 text-right">
                            <Input
                              type="number"
                              step="0.1"
                              {...form.register(`materials.${index}.quantity` as const, { valueAsNumber: true })}
                              className="h-8 text-xs text-right"
                            />
                            {form.formState.errors.materials?.[index]?.quantity && (
                              <p className="text-[10px] text-destructive mt-1">
                                {form.formState.errors.materials[index]?.quantity?.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="p-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center p-6 border border-dashed rounded-md bg-muted/20">
                  <p className="text-xs text-muted-foreground">{t('noMaterials')}</p>
                </div>
              )}
            </div>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
