"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
import { notifyReportPreviewRefresh } from "@/features/report/events";
import { getValidLocale } from "@/i18n/locale";
import { useSchedulerStore } from "@/lib/scheduler-store";
import { MaintenanceEntry } from "@/lib/scheduler-types";
import { cn, getCurrencySymbol } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { areIntervalsOverlapping } from "date-fns";
import {
  AlertCircle,
  Download,
  Loader2,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { MaterialUnit, TaskType } from "../../generated/prisma/enums";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "../ui/combobox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";

const materialSchema = z.object({
  name: z.string().min(1, "Name is required"),
  reference: z.string().optional(),
  quantity: z
    .number()
    .min(0.1, "Quantity must be > 0")
    .multipleOf(0.1, "Only one decimal place allowed"),
  unit: z.nativeEnum(MaterialUnit).optional().default(MaterialUnit.PC),
  price: z.preprocess(
    (value) =>
      value === "" ||
      value === null ||
      value === undefined ||
      Number.isNaN(Number(value))
        ? undefined
        : Number(value),
    z
      .number()
      .min(0, "Price must be ≥ 0")
      .refine(
        (value) => Math.round(value * 100) === value * 100,
        "Only two decimal places allowed",
      )
      .optional(),
  ),
});

const workerLogSchema = z.object({
  workerId: z.string(),
  startTime: z.date(),
  endTime: z.date(),
});

const editFormSchema = z
  .object({
    status: z.string(),
    type: z.nativeEnum(TaskType),
    startTime: z.date(),
    endTime: z.date(),
    workerIds: z.array(z.string()),
    workerLogs: z.array(workerLogSchema).optional(),
    materials: z.array(materialSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endTime <= data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be after start time",
        path: ["endTime"],
      });
    }

    if (data.status === "completed" && data.workerLogs) {
      data.workerLogs.forEach((log, index) => {
        if (log.endTime <= log.startTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Worker end time must be after start time",
            path: ["workerLogs", index, "endTime"],
          });
        }

        if (log.startTime < data.startTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cannot log time before the overall task starts",
            path: ["workerLogs", index, "startTime"],
          });
        }

        if (log.endTime > data.endTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cannot log time after the overall task ends",
            path: ["workerLogs", index, "endTime"],
          });
        }
      });
    }
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

  const locale = getValidLocale(useLocale());
  const t = useTranslations("Form");

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(
        `/api/tasks/${entry.id}/report?locale=${locale}&mode=download`,
      );
      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const filenamePrefix =
        locale === "pt-pt" ? "Folha_de_Obra" : "Maintenance_Report";
      link.setAttribute(
        "download",
        `${filenamePrefix}_${entry.id.substring(0, 8)}.pdf`,
      );
      document.body.appendChild(link);
      link.click();

      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(t("errors.downloadSuccess"));
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error(t("errors.downloadFailure"));
    } finally {
      setIsDownloading(false);
    }
  };

  const equip = equipment.find((e) => e.id === entry.equipmentId);

  const parseEntryDate = (dateVal: any) =>
    typeof dateVal === "string" ? new Date(dateVal) : dateVal;

  const initialStartTime = parseEntryDate(entry.startTime);
  const initialEndTime = parseEntryDate(entry.endTime);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      status: entry.status,
      type: entry.type,
      startTime: initialStartTime,
      endTime: initialEndTime,
      workerIds: entry.assignments?.map((a) => a.workerId) || [],
      workerLogs:
        entry.assignments?.map((a) => ({
          workerId: a.workerId,
          startTime: a.startTime ? new Date(a.startTime) : initialStartTime,
          endTime: a.endTime ? new Date(a.endTime) : initialEndTime,
        })) || [],
      materials:
        entry.materials?.map((m) => ({
          name: m.name,
          reference: m.reference || "",
          quantity: m.quantity,
          unit: m.unit ?? MaterialUnit.PC,
          price:
            m.price !== undefined && m.price !== null
              ? Number(m.price)
              : undefined,
        })) || [],
    },
  });

  const {
    fields: materialFields,
    append: appendMaterial,
    remove: removeMaterial,
  } = useFieldArray({
    control: form.control,
    name: "materials",
  });

  const { fields: workerLogFields, replace: replaceWorkerLogs } = useFieldArray(
    {
      control: form.control,
      name: "workerLogs",
    },
  );

  const watchStatus = form.watch("status");
  const watchStartTime = form.watch("startTime");
  const watchEndTime = form.watch("endTime");
  const watchWorkerIds = form.watch("workerIds");

  // Serialize IDs into a primitive string key to prevent the sync effect from tracking shallow array instances
  const workerIdsKey = useMemo(
    () => (watchWorkerIds || []).join(","),
    [watchWorkerIds],
  );

  // Decoupled log sync: stops constantly running and wiping element states on every single date/time update
  useEffect(() => {
    const currentWorkerIds = watchWorkerIds || [];
    const currentLogs = form.getValues("workerLogs") || [];

    // Evaluate structural changes. If workers match completely, skip replaceWorkerLogs entirely
    const needsSync =
      currentWorkerIds.length !== currentLogs.length ||
      currentWorkerIds.some((id, idx) => currentLogs[idx]?.workerId !== id);

    if (!needsSync) return;

    // Map remaining workers, or empty array if they are completely removed
    const newLogs = currentWorkerIds.map((id) => {
      const existingLog = currentLogs.find((log) => log.workerId === id);
      return (
        existingLog || {
          workerId: id,
          startTime: form.getValues("startTime") || initialStartTime,
          endTime: form.getValues("endTime") || initialEndTime,
        }
      );
    });

    replaceWorkerLogs(newLogs);
  }, [workerIdsKey, replaceWorkerLogs, initialStartTime, initialEndTime, form]);

  const hasConflict = useMemo(() => {
    if (!watchStartTime || !watchEndTime || watchEndTime <= watchStartTime) {
      return false;
    }

    return entries.some((e) => {
      if (e.id === entry.id) return false;
      if (e.equipmentId !== entry.equipmentId) return false;

      return areIntervalsOverlapping(
        { start: watchStartTime, end: watchEndTime },
        { start: new Date(e.startTime), end: new Date(e.endTime) },
      );
    });
  }, [entries, entry.id, entry.equipmentId, watchStartTime, watchEndTime]);

  useEffect(() => {
    if (open && !form.formState.isSubmitting) {
      const currentStartTime = parseEntryDate(entry.startTime);
      const currentEndTime = parseEntryDate(entry.endTime);

      form.reset({
        status: entry.status,
        type: entry.type,
        startTime: currentStartTime,
        endTime: currentEndTime,
        workerIds: entry.assignments?.map((a) => a.workerId) || [],
        workerLogs:
          entry.assignments?.map((a) => ({
            workerId: a.workerId,
            startTime: a.startTime ? new Date(a.startTime) : currentStartTime,
            endTime: a.endTime ? new Date(a.endTime) : currentEndTime,
          })) || [],
        materials:
          entry.materials?.map((m) => ({
            name: m.name,
            reference: m.reference || "",
            quantity: m.quantity,
            unit: m.unit ?? MaterialUnit.PC,
            price:
              m.price !== undefined && m.price !== null
                ? Number(m.price)
                : undefined,
          })) || [],
      });
    }
  }, [open, entry, form, form.formState.isSubmitting]);

  const getStatusBadge = () => {
    switch (entry.status) {
      case "scheduled":
        return (
          <Badge variant="secondary" className="text-xs">
            {t("statusTypes.scheduled")}
          </Badge>
        );
      case "in-progress":
        return (
          <Badge className="bg-chart-3/20 text-chart-3 border-chart-3/40 text-xs">
            {t("statusTypes.in-progress")}
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-chart-1/20 text-chart-1 border-chart-1/40 text-xs">
            {t("statusTypes.completed")}
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
      toast.success(t("errors.deleteSuccess"));
    } catch (error) {
      toast.error(t("errors.deleteFailure"));
    }
  };

  const onSave = async (values: EditFormValues) => {
    if (hasConflict) {
      toast.error(t("errors.conflict"));
      return;
    }

    try {
      await updateEntry(entry.id, values as any);
      notifyReportPreviewRefresh(entry.id);
      toast.success(t("errors.updateSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(t("errors.updateFailure"));
    }
  };

  const workerOptions = workers.map((w) => ({
    label: `${w.name} (${w.email})`,
    value: w.id,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            {t("edit", { title: entry.title })}
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
          className="space-y-4 py-4 -mx-4 max-h-[60vh] overflow-y-auto px-4"
        >
          <div className="space-y-2 pb-2 border-b">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("status")}
            </Label>
            <div className="flex gap-2">
              {["scheduled", "in-progress", "completed"].map((status) => {
                const isActive = watchStatus === status;
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
                    hasError={hasConflict || !!form.formState.errors.startTime}
                  />
                )}
              />
              {form.formState.errors.startTime && (
                <p className="text-[10px] text-destructive font-medium mt-1">
                  {form.formState.errors.startTime.message}
                </p>
              )}
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
                    hasError={hasConflict || !!form.formState.errors.endTime}
                  />
                )}
              />
              {form.formState.errors.endTime && (
                <p className="text-[10px] text-destructive font-medium mt-1">
                  {form.formState.errors.endTime.message}
                </p>
              )}
            </div>
          </div>

          {hasConflict && (
            <div className="flex items-center gap-1.5 p-2 rounded-md bg-destructive/10 text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle className="h-4 w-4" />
              <p className="text-xs font-medium">{t("errors.conflict")}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold">{t("taskType")}</Label>
            <Select
              value={form.watch("type")}
              onValueChange={(v) => form.setValue("type", v as TaskType)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
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
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">
              {t("assignedWorkers")}
            </Label>
            <MultiSelect
              options={workerOptions}
              selected={watchWorkerIds || []}
              onChange={(v) =>
                form.setValue("workerIds", v, { shouldDirty: true })
              }
              placeholder={t("selectWorkers")}
            />
          </div>

          {watchStatus === "completed" && workerLogFields.length > 0 && (
            <div className="pt-2 space-y-2 animate-in fade-in duration-200">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("loggedTimeWorkers")}
              </Label>
              <div className="border rounded-md overflow-hidden bg-background">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[30%] text-xs font-semibold">
                        {t("workerName")}
                      </TableHead>
                      <TableHead className="w-[35%] text-xs font-semibold">
                        {t("startDateTime")}
                      </TableHead>
                      <TableHead className="w-[35%] text-xs font-semibold">
                        {t("endDateTime")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workerLogFields.map((field, index) => {
                      const currentWorker = workers.find(
                        (w) => w.id === field.workerId,
                      );
                      const startError =
                        form.formState.errors.workerLogs?.[index]?.startTime;
                      const endError =
                        form.formState.errors.workerLogs?.[index]?.endTime;

                      const disabledDays =
                        watchStartTime && watchEndTime
                          ? {
                              before: new Date(watchStartTime),
                              after: new Date(watchEndTime),
                            }
                          : undefined;

                      return (
                        <TableRow key={field.id}>
                          <TableCell className="p-3 text-xs font-medium">
                            {currentWorker
                              ? currentWorker.name
                              : "Unknown Worker"}
                          </TableCell>
                          <TableCell className="p-2 vertical-top">
                            <Controller
                              control={form.control}
                              name={`workerLogs.${index}.startTime` as const}
                              render={({ field: subField }) => (
                                <DateTimePicker
                                  date={subField.value}
                                  setDate={subField.onChange}
                                  locale={locale}
                                  placeholder={t("pickDate")}
                                  hasError={!!startError}
                                  disabled={disabledDays}
                                  minDate={watchStartTime}
                                  maxDate={watchEndTime}
                                />
                              )}
                            />
                            {startError && (
                              <p className="text-[10px] text-destructive font-medium mt-1 leading-tight">
                                {startError.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="p-2 vertical-top">
                            <Controller
                              control={form.control}
                              name={`workerLogs.${index}.endTime` as const}
                              render={({ field: subField }) => (
                                <DateTimePicker
                                  date={subField.value}
                                  setDate={subField.onChange}
                                  locale={locale}
                                  placeholder={t("pickDate")}
                                  hasError={!!endError}
                                  disabled={disabledDays}
                                  minDate={watchStartTime}
                                  maxDate={watchEndTime}
                                />
                              )}
                            />
                            {endError && (
                              <p className="text-[10px] text-destructive font-medium mt-1 leading-tight">
                                {endError.message}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold">{t("materials")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() =>
                  appendMaterial({
                    name: "",
                    reference: "",
                    quantity: 1,
                    unit: MaterialUnit.PC,
                    price: undefined,
                  })
                }
              >
                <Plus className="h-4 w-4" />
                {t("addMaterial")}
              </Button>
            </div>

            {materialFields.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[24%]">{t("itemName")}</TableHead>
                      <TableHead className="w-[16%]">
                        {t("reference")}
                      </TableHead>
                      <TableHead className="w-[12%] text-right">
                        {t("quantity")}
                      </TableHead>
                      <TableHead className="w-[18%] min-w-[128px]">
                        {t("unit")}
                      </TableHead>
                      <TableHead className="w-[22%] text-right">
                        {t("price")}
                      </TableHead>
                      <TableHead className="w-[10%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialFields.map((field, index) => (
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
                                form.formState.errors.materials[index]?.quantity
                                  ?.message
                              }
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="p-2 min-w-[120px]">
                          <Controller
                            control={form.control}
                            name={`materials.${index}.unit` as const}
                            render={({ field }) => (
                              <Combobox
                                items={Object.values(MaterialUnit)}
                                value={field.value ?? MaterialUnit.PC}
                                onValueChange={field.onChange}
                              >
                                <ComboboxInput
                                  placeholder={t("selectUnit")}
                                  className="h-8 text-xs w-full min-w-[110px]"
                                />
                                <ComboboxContent>
                                  <ComboboxEmpty>
                                    {t("noMaterials")}
                                  </ComboboxEmpty>
                                  <ComboboxList>
                                    {(unit) => (
                                      <ComboboxItem key={unit} value={unit}>
                                        {t(`materialUnits.${unit}`)}
                                      </ComboboxItem>
                                    )}
                                  </ComboboxList>
                                </ComboboxContent>
                              </Combobox>
                            )}
                          />
                        </TableCell>
                        <TableCell className="p-2 text-right">
                          <InputGroup className="h-8">
                            <InputGroupInput
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              {...form.register(
                                `materials.${index}.price` as const,
                                { valueAsNumber: true },
                              )}
                              className="h-8 text-xs text-right"
                            />
                            <InputGroupAddon className="px-2 text-xs text-muted-foreground">
                              {getCurrencySymbol(locale)}
                            </InputGroupAddon>
                          </InputGroup>
                          {form.formState.errors.materials?.[index]?.price && (
                            <p className="text-[10px] text-destructive mt-1">
                              {
                                form.formState.errors.materials[index]?.price
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
                            onClick={() => removeMaterial(index)}
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
            {isDownloading ? t("downloadingPdf") : t("downloadPdf")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(`${locale}/preview/${entry.id}`, "_blank")
            }
          >
            Preview
          </Button>

          <Field orientation="horizontal" className="justify-end">
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              {t("delete")}
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
                  {t("saving")}
                </span>
              ) : (
                t("saveAll")
              )}
            </Button>
          </Field>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
