"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyTaskUpdated } from "@/features/scheduler/events";
import { getValidLocale } from "src/i18n/locale";
import { deleteTask, updateTask } from "../server/actions";
import { MaintenanceEntry, UpdateEntryPayload } from "../types";
import { useSchedulerStore } from "../store/scheduler-provider";
import { useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { areIntervalsOverlapping } from "date-fns";
import { Download, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";
import {
  EntrySheet,
  FieldError,
  FormSection,
  MaterialsEditor,
  materialSchema,
  ScheduleFields,
} from "./entry-form-parts";

const workerLogSchema = z.object({
  workerId: z.string(),
  startTime: z.date(),
  endTime: z.date(),
});

const editFormSchema = z
  .object({
    status: z.string(),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    equipmentId: z.string().min(1, "Equipment is required"),
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
  const equipment = useSchedulerStore((state) => state.equipment);
  const workers = useSchedulerStore((state) => state.workers);
  const router = useRouter();
  const entries = useSchedulerStore((state) => state.entries);
  const selectedEntry = useSchedulerStore((state) => state.selectedEntry);
  const setEntries = useSchedulerStore((state) => state.setEntries);
  const setSelectedEntry = useSchedulerStore((state) => state.setSelectedEntry);
  const removeEntry = useSchedulerStore((state) => state.removeEntry);
  const updateEntry = useSchedulerStore((state) => state.updateEntry);
  const replaceEntry = useSchedulerStore((state) => state.replaceEntry);

  const locale = getValidLocale(useLocale());
  const t = useTranslations("Form");

  const [isDownloading, setIsDownloading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const parseEntryDate = (dateVal: Date | string) =>
    typeof dateVal === "string" ? new Date(dateVal) : dateVal;

  const initialStartTime = parseEntryDate(entry.startTime);
  const initialEndTime = parseEntryDate(entry.endTime);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      status: entry.status,
      title: entry.title,
      description: entry.description ?? "",
      equipmentId: entry.equipmentId,
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
  const watchEquipmentId = form.watch("equipmentId");

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
      if (e.equipmentId !== watchEquipmentId) return false;

      return areIntervalsOverlapping(
        { start: watchStartTime, end: watchEndTime },
        { start: new Date(e.startTime), end: new Date(e.endTime) },
      );
    });
  }, [entries, entry.id, watchEquipmentId, watchStartTime, watchEndTime]);

  useEffect(() => {
    if (open && !form.formState.isSubmitting) {
      const currentStartTime = parseEntryDate(entry.startTime);
      const currentEndTime = parseEntryDate(entry.endTime);

      form.reset({
        status: entry.status,
        title: entry.title,
        description: entry.description ?? "",
        equipmentId: entry.equipmentId,
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
    const previousEntries = entries;
    const previousSelectedEntry = selectedEntry;

    setIsDeleting(true);
    removeEntry(entry.id);

    try {
      await deleteTask(entry.id);
      setConfirmDeleteOpen(false);
      onOpenChange(false);
      toast.success(t("errors.deleteSuccess"));
    } catch (error) {
      setEntries(previousEntries);
      setSelectedEntry(previousSelectedEntry);
      toast.error(t("errors.deleteFailure"));
    } finally {
      setIsDeleting(false);
    }
  };

  const onSave = async (values: EditFormValues) => {
    if (hasConflict) {
      toast.error(t("errors.conflict"));
      return;
    }

    const previousEntries = entries;
    const previousSelectedEntry = selectedEntry;

    const optimisticUpdates: UpdateEntryPayload = {
      status: values.status,
      title: values.title,
      description: values.description,
      equipmentId: values.equipmentId,
      type: values.type,
      startTime: values.startTime,
      endTime: values.endTime,
      workerIds: values.workerIds,
      workerLogs: values.workerLogs,
    };

    updateEntry(entry.id, optimisticUpdates);

    try {
      const { workerLogs, materials, ...rest } = values;
      const updatedTask = await updateTask(entry.id, {
        ...rest,
        ...(workerLogs !== undefined && { workerLogs }),
        ...(materials !== undefined && {
          materials: materials.map((material) => ({
            name: material.name,
            quantity: material.quantity,
            unit: material.unit ?? undefined,
            reference: material.reference ?? undefined,
            price:
              material.price !== null && material.price !== undefined
                ? Number(material.price)
                : undefined,
          })),
        }),
      });
      replaceEntry(entry.id, updatedTask);
      notifyTaskUpdated(entry.id);
      toast.success(t("errors.updateSuccess"));
      onOpenChange(false);
    } catch (error) {
      setEntries(previousEntries);
      setSelectedEntry(previousSelectedEntry);
      toast.error(t("errors.updateFailure"));
    }
  };

  const workerOptions = workers.map((w) => ({
    label: `${w.name} (${w.email})`,
    value: w.id,
  }));

  const statusOptions = ["scheduled", "in-progress", "completed"] as const;
  const equipSubtitle = [equip?.name, equip?.category]
    .filter(Boolean)
    .join(" - ");

  return (
    <>
      <EntrySheet
        open={open}
        onOpenChange={onOpenChange}
        formId="maintenance-form"
        onSubmit={form.handleSubmit(onSave)}
        title={t("edit", { title: entry.title })}
        meta={getStatusBadge()}
        description={equipSubtitle}
        footer={
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="destructive-outline"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 data-icon="inline-start" />
                {t("delete")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                aria-busy={isDownloading}
              >
                {isDownloading ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Download data-icon="inline-start" />
                )}
                {t("downloadWorkSheet")}
              </Button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                form="maintenance-form"
                disabled={form.formState.isSubmitting || hasConflict}
                aria-busy={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting && (
                  <Spinner data-icon="inline-start" />
                )}
                {form.formState.isSubmitting ? t("saving") : t("save")}
              </Button>
            </div>
          </>
        }
      >
        <FieldGroup>
          <FormSection title={t("status")}>
            <div
              role="group"
              aria-label={t("statusGroup")}
              className="grid grid-cols-3 items-stretch rounded-lg border border-border bg-muted p-0.5"
            >
              {statusOptions.map((status, index) => {
                const isActive = watchStatus === status;
                return (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    aria-pressed={isActive}
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "rounded-md px-2 text-xs",
                      !isActive && "text-muted-foreground",
                      !isActive &&
                        index > 0 &&
                        statusOptions[index - 1] !== watchStatus &&
                        "relative before:absolute before:inset-y-1.5 before:-left-px before:w-px before:bg-border",
                    )}
                    onClick={() =>
                      form.setValue("status", status, { shouldDirty: true })
                    }
                  >
                    {t(`statusTypes.${status}`)}
                  </Button>
                );
              })}
            </div>
          </FormSection>

          <FormSection title={t("sectionDetails")}>
            <Field>
              <FieldLabel htmlFor="task-title">{t("title")}</FieldLabel>
              <Input
                id="task-title"
                {...form.register("title")}
                placeholder={t("titlePlaceholder")}
              />
              <FieldError message={form.formState.errors.title?.message} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="task-equipment">
                  {t("equipment")}
                </FieldLabel>
                <Select
                  value={watchEquipmentId}
                  onValueChange={(v) =>
                    form.setValue("equipmentId", v, { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="task-equipment" className="w-full">
                    <SelectValue placeholder={t("selectEquipment")} />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="task-type">{t("taskType")}</FieldLabel>
                <Select
                  value={form.watch("type")}
                  onValueChange={(v) =>
                    form.setValue("type", v as TaskType, { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="task-type" className="w-full">
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
              </Field>
            </div>
          </FormSection>

          <FormSection title={t("sectionSchedule")}>
            <ScheduleFields
              form={form}
              locale={locale}
              hasConflict={hasConflict}
              startError={form.formState.errors.startTime?.message}
              endError={form.formState.errors.endTime?.message}
            />
          </FormSection>

          <FormSection title={t("sectionTeam")}>
            <Field>
              <FieldLabel htmlFor="task-workers">
                {t("assignedWorkers")}
              </FieldLabel>
              <MultiSelect
                id="task-workers"
                options={workerOptions}
                selected={watchWorkerIds || []}
                onChange={(v) =>
                  form.setValue("workerIds", v, { shouldDirty: true })
                }
                placeholder={t("selectWorkers")}
              searchPlaceholder={t("searchWorkers")}
              emptyText={
                workerOptions.length === 0
                  ? t("noWorkersAvailable")
                  : t("noWorkerFound")
              }
              action={{
                label: t("addWorker"),
                onClick: () => {
                  onOpenChange(false);
                  router.push("/workers");
                },
              }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-description">
                {t("description")}
              </FieldLabel>
              <Textarea
                id="task-description"
                rows={3}
                {...form.register("description")}
                placeholder={t("descriptionPlaceholder")}
              />
            </Field>
          </FormSection>

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

          <MaterialsEditor form={form} locale={locale} />
        </FieldGroup>
      </EntrySheet>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDeleteDescription", { title: entry.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              aria-busy={isDeleting}
            >
              {isDeleting && <Spinner data-icon="inline-start" />}
              {isDeleting ? t("deleting") : t("delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
