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
import { Textarea } from "@/components/ui/textarea";
import { notifyTaskUpdated } from "@/features/scheduler/events";
import { getValidLocale } from "src/i18n/locale";
import { deleteTask, updateTask } from "../server/actions";
import { MaintenanceEntry, UpdateEntryPayload } from "../types";
import { TASK_STATUSES } from "../task-status";
import {
  getTaskDisplayEnd,
} from "../utils/schedule";
import { useSchedulerStore } from "../store/scheduler-provider";
import { useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { areIntervalsOverlapping } from "date-fns";
import { Download, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";
import {
  DailyHoursEditor,
  ChecklistEditor,
  EntrySheet,
  FieldError,
  FormSection,
  MaintenancePointField,
  MaterialsEditor,
  materialSchema,
  ScheduleFields,
} from "./entry-form-parts";

const editFormSchema = z
  .object({
    status: z.string(),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    equipmentId: z.string().min(1, "Equipment is required"),
    maintenancePointId: z.string().nullable(),
    type: z.nativeEnum(TaskType),
    startTime: z.date(),
    endTimeKnown: z.boolean(),
    endTime: z.date().nullable(),
    completedAt: z.date().nullable(),
    workerIds: z.array(z.string()),
    dailyHours: z
      .array(
        z.object({
          workerId: z.string().min(1),
          workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          hours: z.number().min(0.25).max(24).multipleOf(0.25),
        }),
      )
      .optional(),
    checklistItems: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string(),
        sortOrder: z.number(),
        isComplete: z.boolean(),
      }),
    ),
    materials: z.array(materialSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endTimeKnown && !data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time is required when the end time is known",
        path: ["endTime"],
      });
    } else if (data.endTime && data.endTime <= data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Task end time must be after start time",
        path: ["endTime"],
      });
    }

  });

type EditFormInput = z.input<typeof editFormSchema>;
type EditFormValues = z.output<typeof editFormSchema>;

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
  const timeZone = useSchedulerStore((state) => state.timeZone);
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
  const initialEndTime = entry.endTime ? parseEntryDate(entry.endTime) : null;

  const form = useForm<EditFormInput, unknown, EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      status: entry.status,
      title: entry.title,
      description: entry.description ?? "",
      equipmentId: entry.equipmentId,
      maintenancePointId: entry.maintenancePointId,
      type: entry.type,
      startTime: initialStartTime,
      endTimeKnown: initialEndTime !== null,
      endTime: initialEndTime,
      completedAt: entry.completedAt
        ? parseEntryDate(entry.completedAt)
        : null,
      workerIds: entry.assignments?.map((a) => a.workerId) || [],
      dailyHours:
        entry.dailyHours?.map((allocation) => ({
          workerId: allocation.workerId,
          workDate: new Date(allocation.workDate).toISOString().slice(0, 10),
          hours: Number(allocation.hours),
        })) || [],
      checklistItems:
        entry.checklistItems?.map(({ id, title, sortOrder, isComplete }) => ({
          id,
          title,
          sortOrder,
          isComplete,
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

  const watchStatus = useWatch({ control: form.control, name: "status" });
  const watchStartTime = useWatch({ control: form.control, name: "startTime" });
  const watchEndTime = useWatch({ control: form.control, name: "endTime" });
  const watchEndTimeKnown = useWatch({
    control: form.control,
    name: "endTimeKnown",
  });
  const watchCompletedAt = useWatch({
    control: form.control,
    name: "completedAt",
  });
  const watchWorkerIds = useWatch({ control: form.control, name: "workerIds" });
  const watchDailyHours = useWatch({ control: form.control, name: "dailyHours" });
  const watchEquipmentId = useWatch({ control: form.control, name: "equipmentId" });
  const watchMaintenancePointId = useWatch({
    control: form.control,
    name: "maintenancePointId",
  });
  const watchChecklistItems = useWatch({
    control: form.control,
    name: "checklistItems",
  });
  const watchType = useWatch({ control: form.control, name: "type" });

  const hasConflict = useMemo(() => {
    if (!watchStartTime) return false;

    return entries.some((e) => {
      if (e.id === entry.id) return false;
      if (e.equipmentId !== watchEquipmentId) return false;

      return areIntervalsOverlapping(
        {
          start: watchStartTime,
          end: getTaskDisplayEnd(
            watchStartTime,
            watchEndTimeKnown ? watchEndTime : null,
          ),
        },
        {
          start: new Date(e.startTime),
          end: getTaskDisplayEnd(e.startTime, e.endTime),
        },
      );
    });
  }, [
    entries,
    entry.id,
    watchEquipmentId,
    watchStartTime,
    watchEndTime,
    watchEndTimeKnown,
  ]);

  useEffect(() => {
    if (open && !form.formState.isSubmitting) {
      const currentStartTime = parseEntryDate(entry.startTime);

      form.reset({
        status: entry.status,
        title: entry.title,
        description: entry.description ?? "",
        equipmentId: entry.equipmentId,
        maintenancePointId: entry.maintenancePointId,
        type: entry.type,
        startTime: currentStartTime,
        endTimeKnown: entry.endTime != null,
        endTime: entry.endTime ? parseEntryDate(entry.endTime) : null,
        completedAt: entry.completedAt
          ? parseEntryDate(entry.completedAt)
          : null,
        workerIds: entry.assignments?.map((a) => a.workerId) || [],
        dailyHours:
          entry.dailyHours?.map((allocation) => ({
            workerId: allocation.workerId,
            workDate: new Date(allocation.workDate).toISOString().slice(0, 10),
            hours: Number(allocation.hours),
          })) || [],
        checklistItems:
          entry.checklistItems?.map(({ id, title, sortOrder, isComplete }) => ({
            id,
            title,
            sortOrder,
            isComplete,
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
    } catch {
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
    const workerLogs = values.workerIds.map((workerId) => {
      const assignment = entry.assignments?.find(
        (current) => current.workerId === workerId,
      );
      return {
        workerId,
        startTime: assignment?.startTime
          ? parseEntryDate(assignment.startTime)
          : null,
        endTime: assignment?.endTime
          ? parseEntryDate(assignment.endTime)
          : null,
      };
    });

    const optimisticUpdates: UpdateEntryPayload = {
      status: values.status,
      title: values.title,
      description: values.description,
      equipmentId: values.equipmentId,
      maintenancePointId: values.maintenancePointId,
      type: values.type,
      startTime: values.startTime,
      endTime: values.endTimeKnown ? values.endTime : null,
      completedAt: values.completedAt,
      workerIds: values.workerIds,
      dailyHours: values.dailyHours,
      workerLogs,
    };

    updateEntry(entry.id, optimisticUpdates);

    try {
      const {
        endTimeKnown,
        dailyHours,
        materials,
        ...rest
      } = values;
      const updatedTask = await updateTask(entry.id, {
        ...rest,
        endTime: endTimeKnown ? values.endTime : null,
        workerLogs,
        ...(dailyHours !== undefined && { dailyHours }),
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
    } catch {
      setEntries(previousEntries);
      setSelectedEntry(previousSelectedEntry);
      toast.error(t("errors.updateFailure"));
    }
  };

  const workerOptions = workers.map((w) => ({
    label: `${w.name} (${w.email})`,
    value: w.id,
  }));

  const statusOptions = TASK_STATUSES;
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
                    onClick={() => {
                      const previousStatus = form.getValues("status");
                      form.setValue("status", status, {
                        shouldDirty: true,
                      });
                      if (
                        status === "completed" &&
                        previousStatus !== "completed" &&
                        !form.getValues("completedAt")
                      ) {
                        form.setValue("completedAt", new Date(), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                    }}
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
                  onValueChange={(v) => {
                    form.setValue("equipmentId", v, { shouldDirty: true });
                    form.setValue("maintenancePointId", null, {
                      shouldDirty: true,
                    })
                  }}
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
                  value={watchType}
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
                    <SelectItem value={TaskType.PREDICTIVE}>
                      {t("inspection")}
                    </SelectItem>
                    <SelectItem value={TaskType.CORRECTIVE}>
                      {t("corrective")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <MaintenancePointField
              key={`${watchEquipmentId}-${open}`}
              equipmentId={watchEquipmentId}
              open={open}
              value={watchMaintenancePointId}
              onChange={(value) =>
                form.setValue("maintenancePointId", value, {
                  shouldDirty: true,
                })
              }
            />
          </FormSection>

          <FormSection title={t("sectionSchedule")}>
            <ScheduleFields
              form={form}
              locale={locale}
              timeZone={timeZone}
              hasConflict={hasConflict}
              endError={form.formState.errors.endTime?.message}
              startError={form.formState.errors.startTime?.message}
            />
          </FormSection>

          {(watchStatus === "completed" || watchCompletedAt) && (
            <FormSection title={t("completion")}>
              <Field>
                <FieldLabel htmlFor="task-completed-at">
                  {t("completionDateTime")}
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="completedAt"
                  render={({ field }) => (
                    <DateTimePicker
                      date={field.value ?? undefined}
                      setDate={(date) => field.onChange(date ?? null)}
                      locale={locale}
                      timeZone={timeZone}
                      id="task-completed-at"
                      ariaLabel={t("completionDateTime")}
                      placeholder={t("pickDate")}
                    />
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {t("completionDateTimeHint")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("timesUseOrganizationTimezone", { timeZone })}
                </p>
              </Field>
            </FormSection>
          )}

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

          <DailyHoursEditor
            value={watchDailyHours ?? []}
            workers={workers}
            assignedWorkerIds={watchWorkerIds ?? []}
            startTime={watchStartTime ?? initialStartTime}
            locale={locale}
            timeZone={timeZone}
            onChange={(dailyHours) =>
              form.setValue("dailyHours", dailyHours, { shouldValidate: true })
            }
          />

          <ChecklistEditor
            value={watchChecklistItems ?? []}
            onChange={(items) =>
              form.setValue("checklistItems", items, { shouldDirty: true })
            }
          />

          {(entry.reminders?.length ?? 0) > 0 && (
            <FormSection title={t("reminders.title")}>
              <div className="space-y-2">
                {entry.reminders?.map((reminder) => {
                  const statusLabel = {
                    PENDING: t("reminders.statusPending"),
                    SENDING: t("reminders.statusSending"),
                    SENT: t("reminders.statusSent"),
                    FAILED: t("reminders.statusFailed"),
                    CANCELLED: t("reminders.statusCancelled"),
                  }[reminder.status];
                  const scheduledDate = new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone,
                  }).format(new Date(reminder.scheduledFor));
                  return (
                    <div
                      key={reminder.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{reminder.worker.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("reminders.scheduledFor", { date: scheduledDate })}
                        </p>
                      </div>
                      <Badge variant={reminder.status === "FAILED" ? "destructive" : "outline"}>
                        {statusLabel}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </FormSection>
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
