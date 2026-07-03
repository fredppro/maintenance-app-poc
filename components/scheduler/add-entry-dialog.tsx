"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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

import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Textarea } from '@/components/ui/textarea';
import { getValidLocale } from "@/i18n/locale";
import { useSchedulerStore } from '@/lib/scheduler-store';
import { getCurrencySymbol } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { addHours, areIntervalsOverlapping } from 'date-fns';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { TaskType } from '../../generated/prisma/enums';

const materialSchema = z.object({
  name: z.string().min(1, "Name is required"),
  reference: z.string().optional(),
  quantity: z.number().min(0.1, 'Quantity must be > 0').multipleOf(0.1, 'Only one decimal place allowed'),
  price: z.preprocess(
    (value) =>
      value === '' || value === null || value === undefined || Number.isNaN(Number(value))
        ? undefined
        : Number(value),
    z
      .number()
      .min(0, 'Price must be ≥ 0')
      .refine(
        (value) => Math.round(value * 100) === value * 100,
        'Only two decimal places allowed',
      )
      .optional(),
  ),
})

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.nativeEnum(TaskType),
  equipmentId: z.string().min(1, "Equipment is required"),
  startTime: z.date(),
  endTime: z.date(),
  workerIds: z.array(z.string()).min(1, "Select at least one worker"),
  materials: z.array(materialSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCell: { date: Date; equipmentId: string } | null;
}

export function AddEntryDialog({
  open,
  onOpenChange,
  selectedCell,
}: AddEntryDialogProps) {
  const { addEntry, equipment, workers, entries } = useSchedulerStore();

  const locale = getValidLocale(useLocale());
  const t = useTranslations("Form");
  const tCommon = useTranslations("Common");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      type: TaskType.PREVENTIVE,
      equipmentId: "",
      startTime: new Date(),
      endTime: addHours(new Date(), 1),
      workerIds: [],
      materials: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "materials",
  });

  const watchEquipmentId = form.watch("equipmentId");
  const watchStartTime = form.watch("startTime");
  const watchEndTime = form.watch("endTime");

  const hasConflict = useMemo(() => {
    if (
      !watchEquipmentId ||
      !watchStartTime ||
      !watchEndTime ||
      watchEndTime <= watchStartTime
    ) {
      return false;
    }

    return entries.some((entry) => {
      if (entry.equipmentId !== watchEquipmentId) return false;

      return areIntervalsOverlapping(
        { start: watchStartTime, end: watchEndTime },
        { start: new Date(entry.startTime), end: new Date(entry.endTime) },
      );
    });
  }, [entries, watchEquipmentId, watchStartTime, watchEndTime]);

  useEffect(() => {
    if (selectedCell && open) {
      form.setValue("equipmentId", selectedCell.equipmentId);
      const start = new Date(selectedCell.date);
      form.setValue("startTime", start);
      form.setValue("endTime", addHours(start, 1));
    }
  }, [selectedCell, open, form]);

  const onSubmit = async (values: FormValues) => {
    if (values.endTime <= values.startTime) {
      toast.error(t("errors.endAfterStart"));
      return;
    }

    if (hasConflict) {
      toast.error(t("errors.conflict"));
      return;
    }

    try {
      await addEntry({
        ...values,
        status: "scheduled",
      });
      toast.success(t("errors.success"));
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to add entry:", error);
      toast.error(t("errors.failure"));
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
          <DialogTitle>{t("schedule")}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-6 -mx-4 max-h-[75vh] overflow-y-auto px-4"
        >
          <FieldGroup>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <FieldLabel>{t("equipment")}</FieldLabel>
                <Select
                  value={form.watch("equipmentId")}
                  onValueChange={(v) => form.setValue("equipmentId", v)}
                >
                  <SelectTrigger
                    className={
                      hasConflict
                        ? "border-destructive text-destructive focus:ring-destructive"
                        : ""
                    }
                  >
                    <SelectValue placeholder={t("selectEquipment")} />
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
                  <p className="text-xs text-destructive">
                    {form.formState.errors.equipmentId.message}
                  </p>
                )}
                {hasConflict && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <p className="text-xs font-medium">
                      {t("errors.conflict")}
                    </p>
                  </div>
                )}
              </Field>

              <Field>
                <FieldLabel>{t("taskType")}</FieldLabel>
                <Select
                  value={form.watch("type")}
                  onValueChange={(v) => form.setValue("type", v as TaskType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TaskType.PREVENTIVE}>
                      {t("preventive")}
                    </SelectItem>
                    <SelectItem value={TaskType.INSPECTION}>
                      {t("inspection")}
                    </SelectItem>
                    <SelectItem value={TaskType.CORRECTIVE}>
                      {t("corrective")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel>{t("title")}</FieldLabel>
              <Input
                {...form.register("title")}
                placeholder={t("titlePlaceholder")}
              />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.title.message}
                </p>
              )}
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">
                  {t("startDateTime")}
                </Label>
                <Controller
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <DateTimePicker
                      date={field.value}
                      setDate={field.onChange}
                      locale={locale}
                      placeholder={t("pickDate")}
                      hasError={hasConflict}
                    />
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">
                  {t("endDateTime")}
                </Label>
                <Controller
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <DateTimePicker
                      date={field.value}
                      setDate={field.onChange}
                      locale={locale}
                      placeholder={t("pickDate")}
                      hasError={hasConflict}
                    />
                  )}
                />
              </div>
            </div>

            <Field>
              <FieldLabel>{t("description")}</FieldLabel>
              <Textarea
                {...form.register("description")}
                placeholder={t("descriptionPlaceholder")}
                rows={2}
              />
            </Field>

            <Field>
              <FieldLabel>{t("assignedWorkers")}</FieldLabel>
              <MultiSelect
                options={workerOptions}
                selected={form.watch("workerIds")}
                onChange={(v) => form.setValue("workerIds", v)}
                placeholder={t("selectWorkers")}
              />
              {form.formState.errors.workerIds && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.workerIds.message}
                </p>
              )}
            </Field>

            <div className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold">{t("materials")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => append({ name: '', reference: '', quantity: 1, price: undefined })}
                >
                  <Plus className="h-4 w-4" />
                  {t("addMaterial")}
                </Button>
              </div>

              {fields.length > 0 ? (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[35%]">{t('itemName')}</TableHead>
                        <TableHead className="w-[20%]">{t('reference')}</TableHead>
                        <TableHead className="w-[15%] text-right">{t('quantity')}</TableHead>
                        <TableHead className="w-[20%] text-right">
                          {t('price')} ({getCurrencySymbol(locale)})
                        </TableHead>
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
                              placeholder={t("itemName")}
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
                              placeholder={t("reference")}
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
                                  form.formState.errors.materials[index]
                                    ?.quantity?.message
                                }
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="p-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              {...form.register(`materials.${index}.price` as const, { valueAsNumber: true })}
                              className="h-8 text-xs text-right"
                            />
                            {form.formState.errors.materials?.[index]?.price && (
                              <p className="text-[10px] text-destructive mt-1">
                                {form.formState.errors.materials[index]?.price?.message}
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
                    {t("noMaterials")}
                  </p>
                </div>
              )}
            </div>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || hasConflict}
            >
              {form.formState.isSubmitting ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
