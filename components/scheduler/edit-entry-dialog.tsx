"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useSchedulerStore } from "@/lib/scheduler-store";
import { MaintenanceEntry } from "@/lib/scheduler-types";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Wrench, AlertCircle, Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { TaskType } from "../../generated/prisma/enums";
import { useLocale, useTranslations } from 'next-intl'
import { areIntervalsOverlapping } from "date-fns";
import { notifyReportPreviewRefresh } from "@/features/report/events";

const materialSchema = z.object({
  name: z.string().min(1, "Name is required"),
  reference: z.string().optional(),
  quantity: z
    .number()
    .min(0.1, "Quantity must be > 0")
    .multipleOf(0.1, "Only one decimal place allowed"),
});

const editFormSchema = z.object({
  status: z.string(),
  type: z.nativeEnum(TaskType),
  startTime: z.date(),
  endTime: z.date(),
  workerIds: z.array(z.string()).min(1, "Select at least one worker"),
  materials: z.array(materialSchema).optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

interface EditEntryDialogProps {
  entry: MaintenanceEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEntryDialog({
  entry,
  open,
  onOpenChange,
}: EditEntryDialogProps) {
  const { equipment, workers, removeEntry, updateEntry, entries } =
    useSchedulerStore();
  const locale = useLocale()
  const t = useTranslations('Form')
  const tCommon = useTranslations('Common')

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/tasks/${entry.id}/report?locale=${locale}&mode=download`);
      if (!response.ok) {
        const text = await response.text();
  console.error("PDF API error:", text);
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filenamePrefix = locale === 'pt-pt' ? 'Folha_de_Obra' : 'Maintenance_Report';
      link.setAttribute('download', `${filenamePrefix}_${entry.id.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();

      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(t('errors.downloadSuccess'));
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error(t('errors.downloadFailure'));
    } finally {
      setIsDownloading(false);
    }
  };
  
  const equip = equipment.find((e) => e.id === entry.equipmentId);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      status: entry.status,
      type: entry.type,
      startTime: new Date(entry.startTime),
      endTime: new Date(entry.endTime),
      workerIds: entry.assignments?.map((a) => a.workerId) || [],
      materials:
        entry.materials?.map((m) => ({
          name: m.name,
          reference: m.reference || "",
          quantity: m.quantity,
        })) || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "materials",
  });

  const watchStartTime = form.watch('startTime')
  const watchEndTime = form.watch('endTime')

  const hasConflict = useMemo(() => {
    if (!watchStartTime || !watchEndTime || watchEndTime <= watchStartTime) {
      return false
    }

    return entries.some((e) => {
      // Don't conflict with itself
      if (e.id === entry.id) return false
      // Only check same equipment
      if (e.equipmentId !== entry.equipmentId) return false
      
      return areIntervalsOverlapping(
        { start: watchStartTime, end: watchEndTime },
        { start: new Date(e.startTime), end: new Date(e.endTime) }
      )
    })
  }, [entries, entry.id, entry.equipmentId, watchStartTime, watchEndTime])

  useEffect(() => {
    if (open && !form.formState.isSubmitting) {
      form.reset({
        status: entry.status,
        type: entry.type,
        startTime: new Date(entry.startTime),
        endTime: new Date(entry.endTime),
        workerIds: entry.assignments?.map((a) => a.workerId) || [],
        materials:
          entry.materials?.map((m) => ({
            name: m.name,
            reference: m.reference || "",
            quantity: m.quantity,
          })) || [],
      });
    }
  }, [open, entry, form, form.formState.isSubmitting]);

  const getStatusBadge = () => {
    switch (entry.status) {
      case "scheduled":
        return (
          <Badge variant="secondary" className="text-xs">
            {t('statusTypes.scheduled')}
          </Badge>
        );
      case "in-progress":
        return (
          <Badge className="bg-chart-3/20 text-chart-3 border-chart-3/40 text-xs">
            {t('statusTypes.in-progress')}
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-chart-1/20 text-chart-1 border-chart-1/40 text-xs">
            {t('statusTypes.completed')}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {entry.status}
          </Badge>
        );
    }
  };

  const handleDelete = async () => {
    try {
      await removeEntry(entry.id);
      onOpenChange(false);
      toast.success(t('errors.deleteSuccess'));
    } catch (error) {
      toast.error(t('errors.deleteFailure'));
    }
  };

  const onSave = async (values: EditFormValues) => {
    if (values.endTime <= values.startTime) {
      toast.error(t('errors.endAfterStart'));
      return;
    }

    if (hasConflict) {
      toast.error(t('errors.conflict'));
      return;
    }

    try {
      // TODO: find a better solution instead of using any
      await updateEntry(entry.id, values as any);
      notifyReportPreviewRefresh(entry.id);
      toast.success(t('errors.updateSuccess'));
      onOpenChange(false);
    } catch (error) {
      toast.error(t('errors.updateFailure'));
    }
  };

  const workerOptions = workers.map((w) => ({
    label: `${w.name} (${w.email})`,
    value: w.id,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl lg:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            {t('edit', { title: entry.title })}
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            {equip?.name} {equip?.category ? `- ${equip.category}` : ""}
            <span className="text-sm text-muted-foreground font-medium">
              {getStatusBadge()}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form
          id="maintenance-form"
          onSubmit={form.handleSubmit(onSave)}
          className="space-y-4 py-4 -mx-4 max-h-[50vh] overflow-y-auto px-4"
        >
          {/* Status moved to top and integrated into form state */}
          <div className="space-y-2 pb-2 border-b">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('status')}
            </Label>
            <div className="flex gap-2">
              {["scheduled", "in-progress", "completed"].map((status) => {
                const isActive = form.watch("status") === status;
                return (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    className={cn(
                      "flex-1 capitalize text-xs h-8 transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                    variant={isActive ? "default" : "outline"}
                    onClick={() =>
                      form.setValue("status", status, { shouldDirty: true })
                    }
                  >
                    {t(`statusTypes.${status as keyof typeof t}`)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t('startDateTime')}</Label>
              <Controller
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <DateTimePicker
                    date={field.value}
                    setDate={field.onChange}
                    locale={locale}
                    placeholder={t('pickDate')}
                    hasError={hasConflict}
                  />
                )}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t('endDateTime')}</Label>
              <Controller
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <DateTimePicker
                    date={field.value}
                    setDate={field.onChange}
                    locale={locale}
                    placeholder={t('pickDate')}
                    hasError={hasConflict}
                  />
                )}
              />
            </div>
          </div>
          
          {hasConflict && (
            <div className="flex items-center gap-1.5 p-2 rounded-md bg-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle className="h-4 w-4" />
              <p className="text-xs font-medium">{t('errors.conflict')}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold">{t('taskType')}</Label>
            <Select
              value={form.watch("type")}
              onValueChange={(v) => form.setValue("type", v as TaskType)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TaskType.PREVENTIVE}>{t('preventive')}</SelectItem>
                <SelectItem value={TaskType.INSPECTION}>{t('inspection')}</SelectItem>
                <SelectItem value={TaskType.CORRECTIVE}>{t('corrective')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">{t('assignedWorkers')}</Label>
            <MultiSelect
              options={workerOptions}
              selected={form.watch("workerIds")}
              onChange={(v) => form.setValue("workerIds", v)}
              placeholder={t('selectWorkers')}
            />
          </div>

          <div className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold">{t('materials')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => append({ name: "", reference: "", quantity: 1 })}
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
                            {...form.register(
                              `materials.${index}.name` as const,
                            )}
                            placeholder={t('itemName')}
                            className="h-8 text-xs"
                          />
                          {form.formState.errors.materials?.[index]?.name && (
                            <p className="text-[10px] text-destructive mt-1">
                              {
                                form.formState.errors.materials[index]?.name
                                  ?.message
                              }
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="p-2">
                          <Input
                            {...form.register(
                              `materials.${index}.reference` as const,
                            )}
                            placeholder={t('reference')}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-2 text-right">
                          <Input
                            type="number"
                            step="0.1"
                            {...form.register(
                              `materials.${index}.quantity` as const,
                              { valueAsNumber: true },
                            )}
                            className="h-8 text-xs text-right"
                          />
                          {form.formState.errors.materials?.[index]
                            ?.quantity && (
                            <p className="text-[10px] text-destructive mt-1">
                              {
                                form.formState.errors.materials[index]?.quantity
                                  ?.message
                              }
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
                <p className="text-xs text-muted-foreground">
                  {t('noMaterials')}
                </p>
              </div>
            )}
          </div>
        </form>

        <DialogFooter className="flex flex-row justify-between items-center gap-2 mt-2 border-t pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="h-8 text-xs gap-1.5"
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {isDownloading ? t('downloadingPdf') : t('downloadPdf')}
          </Button>

          <Field orientation="horizontal" className="justify-end">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              {t('delete')}
            </Button>
            <Button
              type="submit"
              form="maintenance-form"
              size="sm"
              disabled={form.formState.isSubmitting || hasConflict}
            >
              {form.formState.isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('saving')}
                </span>
              ) : (
                t('saveAll')
              )}
            </Button>
          </Field>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
