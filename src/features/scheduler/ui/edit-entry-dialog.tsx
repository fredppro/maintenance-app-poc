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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import {
  deleteTask,
  previewMaintenanceTaskEmail,
  sendMaintenanceTaskEmail,
  updateTask,
} from "../server/actions";
import { MaintenanceEntry, UpdateEntryPayload } from "../types";
import { TASK_STATUSES } from "../task-status";
import {
  getTaskDisplayEnd,
} from "../utils/schedule";
import { inferWorkLogStartTimes } from "../utils/worker-hours";
import { useSchedulerStore } from "../store/scheduler-provider";
import { useRouter } from "@/i18n/routing";
import { formatTimeInTimeZone } from "@/lib/time-zone";
import { zodResolver } from "@hookform/resolvers/zod";
import { areIntervalsOverlapping } from "date-fns";
import { Download, Mail, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { MaterialUnit, TaskType } from "../../../../prisma/generated/prisma/enums";
import {
  DailyHoursEditor,
  ChecklistEditor,
  type ChecklistFormValue,
  EntrySheet,
  FieldError,
  FieldInfoTooltip,
  FormSection,
  dailyHoursFormSchema,
  MaintenancePointField,
  MaterialsEditor,
  materialSchema,
  ScheduleFields,
} from "./entry-form-parts";

const statusToggleClasses: Record<(typeof TASK_STATUSES)[number], string> = {
  scheduled:
    "px-1 text-xs text-chart-1 hover:bg-chart-1/10 data-[state=on]:bg-chart-1/15 data-[state=on]:text-chart-1",
  "in-progress":
    "px-1 text-xs text-chart-3 hover:bg-chart-3/10 data-[state=on]:bg-chart-3/15 data-[state=on]:text-chart-3",
  completed:
    "px-1 text-xs text-chart-5 hover:bg-chart-5/10 data-[state=on]:bg-chart-5/15 data-[state=on]:text-chart-5",
  cancelled:
    "px-1 text-xs text-foreground hover:bg-foreground/10 data-[state=on]:bg-foreground data-[state=on]:text-background",
};

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
    dailyHours: z.array(dailyHoursFormSchema).optional(),
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
type TaskEmailPreview = Awaited<
  ReturnType<typeof previewMaintenanceTaskEmail>
>;

const parseEntryDate = (dateVal: Date | string) =>
  typeof dateVal === "string" ? new Date(dateVal) : dateVal;

function getEditFormDefaults(
  entry: MaintenanceEntry,
  timeZone: string,
): EditFormInput {
  return {
    status: entry.status,
    title: entry.title,
    description: entry.description ?? "",
    equipmentId: entry.equipmentId,
    maintenancePointId: entry.maintenancePointId,
    type: entry.type,
    startTime: parseEntryDate(entry.startTime),
    endTimeKnown: entry.endTime != null,
    endTime: entry.endTime ? parseEntryDate(entry.endTime) : null,
    completedAt: entry.completedAt
      ? parseEntryDate(entry.completedAt)
      : null,
    workerIds: entry.assignments?.map((assignment) => assignment.workerId) || [],
    dailyHours:
      entry.dailyHours?.map((allocation) => ({
        id: allocation.id,
        workerId: allocation.workerId,
        workDate: new Date(allocation.workDate).toISOString().slice(0, 10),
        startTime: allocation.startTime
          ? formatTimeInTimeZone(new Date(allocation.startTime), timeZone)
          : "",
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
      entry.materials?.map((material) => ({
        name: material.name,
        reference: material.reference || "",
        quantity: material.quantity,
        unit: material.unit ?? MaterialUnit.PC,
        price:
          material.price !== undefined && material.price !== null
            ? Number(material.price)
            : undefined,
      })) || [],
  };
}

const maintenancePointCacheKey = (id: string | null | undefined) =>
  id ?? "__none__";

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
  const [taskEmailPreview, setTaskEmailPreview] =
    useState<TaskEmailPreview | null>(null);
  const [taskEmailRequestId, setTaskEmailRequestId] = useState<string | null>(
    null,
  );
  const [isLoadingTaskEmailPreview, setIsLoadingTaskEmailPreview] =
    useState(false);
  const [isSendingTaskEmail, setIsSendingTaskEmail] = useState(false);
  const [confirmTaskEmailOpen, setConfirmTaskEmailOpen] = useState(false);

  const handlePreviewTaskEmail = async () => {
    setIsLoadingTaskEmailPreview(true);
    try {
      setTaskEmailPreview(await previewMaintenanceTaskEmail(entry.id));
      setTaskEmailRequestId(crypto.randomUUID());
      setConfirmTaskEmailOpen(true);
    } catch (error) {
      console.error("Failed to load maintenance task email recipients:", error);
      toast.error(t("notifications.previewFailure"));
    } finally {
      setIsLoadingTaskEmailPreview(false);
    }
  };

  const handleSendTaskEmail = async () => {
    if (
      !taskEmailPreview ||
      !taskEmailRequestId ||
      taskEmailPreview.recipients.length === 0
    ) {
      return;
    }

    setIsSendingTaskEmail(true);
    try {
      const result = await sendMaintenanceTaskEmail({
        taskId: entry.id,
        workerIds: taskEmailPreview.recipients.map(({ workerId }) => workerId),
        requestId: taskEmailRequestId,
      });
      notifyTaskUpdated(entry.id);
      if (result.failed > 0 || result.pending > 0) {
        toast.error(
          t("notifications.sendPartialFailure", {
            sent: result.sent,
            failed: result.failed + result.pending,
          }),
        );
      } else {
        toast.success(
          t("notifications.sendSuccess", { count: result.sent }),
        );
        setConfirmTaskEmailOpen(false);
        setTaskEmailRequestId(null);
      }
    } catch (error) {
      console.error("Failed to send maintenance task email:", error);
      toast.error(t("notifications.sendFailure"));
    } finally {
      setIsSendingTaskEmail(false);
    }
  };

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

  const initialStartTime =
    typeof entry.startTime === "string"
      ? new Date(entry.startTime)
      : entry.startTime;

  const form = useForm<EditFormInput, unknown, EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: getEditFormDefaults(entry, timeZone),
  });
  const initializedEntryId = useRef<string | null>(null);
  const checklistByPoint = useRef<Map<string, ChecklistFormValue[]>>(new Map());

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

  const handleEquipmentChange = (equipmentId: string) => {
    form.setValue("equipmentId", equipmentId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("maintenancePointId", null, {
      shouldDirty: true,
      shouldValidate: true,
    });
    checklistByPoint.current = new Map([
      [maintenancePointCacheKey(null), []],
    ]);
    form.setValue("checklistItems", [], {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleMaintenancePointChange = (
    maintenancePointId: string | null,
    templateItems: ChecklistFormValue[],
  ) => {
    const currentPointId = form.getValues("maintenancePointId");
    const currentItems = form.getValues("checklistItems") ?? [];
    checklistByPoint.current.set(
      maintenancePointCacheKey(currentPointId),
      currentItems,
    );

    const nextPointKey = maintenancePointCacheKey(maintenancePointId);
    const nextItems =
      checklistByPoint.current.get(nextPointKey) ?? templateItems;
    checklistByPoint.current.set(nextPointKey, nextItems);

    form.setValue("maintenancePointId", maintenancePointId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("checklistItems", nextItems, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleChecklistChange = (items: ChecklistFormValue[]) => {
    form.setValue("checklistItems", items, {
      shouldDirty: true,
      shouldValidate: true,
    });
    checklistByPoint.current.set(
      maintenancePointCacheKey(form.getValues("maintenancePointId")),
      items,
    );
  };

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
    if (!open) {
      initializedEntryId.current = null;
      return;
    }

    if (initializedEntryId.current === entry.id) return;

    const defaults = getEditFormDefaults(entry, timeZone);
    form.reset(defaults);
    checklistByPoint.current = new Map([
      [
        maintenancePointCacheKey(entry.maintenancePointId),
        defaults.checklistItems ?? [],
      ],
    ]);
    initializedEntryId.current = entry.id;
  }, [open, entry, form, timeZone]);

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
    const dailyHours = values.dailyHours ?? [];
    const inferredStarts = inferWorkLogStartTimes(
      dailyHours,
      values.startTime,
      timeZone,
    );
    const unresolvedStartIndex = dailyHours.findIndex(
      (row, index) =>
        !row.id && Boolean(row.workerId) && !row.startTime && !inferredStarts[index],
    );
    if (unresolvedStartIndex !== -1) {
      form.setError(`dailyHours.${unresolvedStartIndex}.startTime`, {
        type: "validate",
        message: t("dailyHours.startTimeRequired"),
      });
      return;
    }
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
    } catch (error) {
      console.error("Failed to update maintenance task:", error);
      setEntries(previousEntries);
      setSelectedEntry(previousSelectedEntry);
      form.setError("root.server", {
        type: "server",
        message: t("errors.updateFailure"),
      });
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
        onChange={() => form.clearErrors("root.server")}
        title={t("edit", { title: entry.title })}
        meta={getStatusBadge()}
        description={equipSubtitle}
        footer={
          <>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Button
                type="button"
                variant="destructive-outline"
                className="flex-1 sm:flex-none"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 data-icon="inline-start" />
                {t("delete")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="flex-1 sm:flex-none"
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
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => onOpenChange(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                form="maintenance-form"
                className="flex-1 sm:flex-none"
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
          {form.formState.errors.root?.server?.message && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {form.formState.errors.root.server.message}
              </AlertDescription>
            </Alert>
          )}
          <FormSection title={t("status")} showSeparator>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={watchStatus}
              aria-label={t("statusGroup")}
              className="grid w-full grid-cols-4"
              onValueChange={(status) => {
                if (!status) return;
                const previousStatus = form.getValues("status");
                form.setValue("status", status, { shouldDirty: true });
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
              {statusOptions.map((status) => (
                <ToggleGroupItem
                  key={status}
                  value={status}
                  aria-label={t(`statusTypes.${status}`)}
                  className={statusToggleClasses[status]}
                >
                  {t(`statusTypes.${status}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FormSection>

          <FormSection title={t("sectionDetails")} showSeparator>
            <Field data-invalid={!!form.formState.errors.title || undefined}>
              <FieldLabel htmlFor="task-title">{t("title")}</FieldLabel>
              <Input
                id="task-title"
                aria-required="true"
                aria-invalid={!!form.formState.errors.title || undefined}
                aria-describedby={
                  form.formState.errors.title ? "task-title-error" : undefined
                }
                {...form.register("title")}
                placeholder={t("titlePlaceholder")}
              />
              <FieldError
                id="task-title-error"
                message={form.formState.errors.title?.message}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                data-invalid={
                  !!form.formState.errors.equipmentId || undefined
                }
              >
                <FieldLabel htmlFor="task-equipment">
                  {t("equipment")}
                </FieldLabel>
                <Select
                  value={watchEquipmentId}
                  onValueChange={handleEquipmentChange}
                >
                  <SelectTrigger
                    id="task-equipment"
                    className="w-full"
                    aria-required="true"
                    aria-invalid={
                      !!form.formState.errors.equipmentId || undefined
                    }
                    aria-describedby={
                      form.formState.errors.equipmentId
                        ? "task-equipment-error"
                        : undefined
                    }
                  >
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
                <FieldError
                  id="task-equipment-error"
                  message={form.formState.errors.equipmentId?.message}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="task-type">{t("taskType")}</FieldLabel>
                <Select
                  value={watchType}
                  onValueChange={(v) =>
                    form.setValue("type", v as TaskType, { shouldDirty: true })
                  }
                >
                  <SelectTrigger
                    id="task-type"
                    className="w-full"
                    aria-required="true"
                  >
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
          </FormSection>

          <FormSection title={t("sectionSchedule")} showSeparator>
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
            <FormSection title={t("completion")} showSeparator>
              <Field>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="task-completed-at">
                    {t("completionDateTime")}
                  </FieldLabel>
                  <FieldInfoTooltip label={t("completionInfoLabel")}>
                    <p>{t("completionDateTimeHint")}</p>
                    <p>{t("timesUseOrganizationTimezone", { timeZone })}</p>
                  </FieldInfoTooltip>
                </div>
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
              </Field>
            </FormSection>
          )}

          <FormSection title={t("sectionTeam")} showSeparator>
            <Field
              data-invalid={!!form.formState.errors.workerIds || undefined}
            >
              <FieldLabel htmlFor="task-workers">
                {t("assignedWorkers")}
              </FieldLabel>
              <MultiSelect
                id="task-workers"
                aria-label={t("assignedWorkers")}
                aria-invalid={!!form.formState.errors.workerIds || undefined}
                aria-describedby={
                  form.formState.errors.workerIds ? "task-workers-error" : undefined
                }
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
              <FieldError
                id="task-workers-error"
                message={form.formState.errors.workerIds?.message}
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
            showValidationErrors={form.formState.submitCount > 0}
            onChange={(dailyHours) =>
              form.setValue("dailyHours", dailyHours, { shouldValidate: true })
            }
          />

          <ChecklistEditor
            value={watchChecklistItems ?? []}
            maintenancePointField={
              <MaintenancePointField
                key={`${watchEquipmentId}-${open}`}
                equipmentId={watchEquipmentId}
                open={open}
                value={watchMaintenancePointId}
                onChange={handleMaintenancePointChange}
              />
            }
            onChange={handleChecklistChange}
          />

          {(entry.assignments?.length ?? 0) > 0 ||
          (entry.reminders?.length ?? 0) > 0 ? (
            <FormSection title={t("notifications.title")} showSeparator>
              <Card className="gap-0 overflow-hidden py-0">
                <CardHeader className="gap-3 border-b bg-muted/30 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                      <CardTitle
                        role="heading"
                        aria-level={4}
                        className="text-sm"
                      >
                        {t("notifications.automaticTitle")}
                      </CardTitle>
                      <CardDescription className="leading-relaxed">
                        {t("notifications.automaticDescription")}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="w-fit shrink-0">
                      {t("notifications.automaticBadge")}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-3 px-4 py-4">
                  <h5 className="text-sm font-medium">
                    {t("notifications.historyTitle")}
                  </h5>
                  {entry.reminders?.length ? (
                    <ul
                      aria-label={t("notifications.historyTitle")}
                      className="flex flex-col gap-2"
                    >
                      {entry.reminders.map((reminder) => {
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
                        const notificationTypeLabel = {
                          ASSIGNMENT: t("notifications.assignment"),
                          REMINDER: t("notifications.reminder"),
                          MANUAL: t("notifications.manual"),
                        }[reminder.notificationType];
                        const isManual =
                          reminder.notificationType === "MANUAL";

                        return (
                          <li
                            key={reminder.id}
                            className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">
                                  {reminder.worker.name}
                                </p>
                                <Badge
                                  variant={isManual ? "secondary" : "outline"}
                                >
                                  {t(
                                    isManual
                                      ? "notifications.manualBadge"
                                      : "notifications.automaticBadge",
                                  )}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {notificationTypeLabel} ·{" "}
                                {t("reminders.scheduledFor", {
                                  date: scheduledDate,
                                })}
                              </p>
                            </div>
                            <Badge
                              variant={
                                reminder.status === "FAILED"
                                  ? "destructive"
                                  : reminder.status === "SENT"
                                    ? "secondary"
                                    : "outline"
                              }
                              className="w-fit shrink-0"
                            >
                              {statusLabel}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("notifications.historyEmpty")}
                    </p>
                  )}
                </CardContent>

                <Separator />

                <CardFooter className="flex-col items-stretch gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <h5 className="text-sm font-medium">
                      {t("notifications.manualTitle")}
                    </h5>
                    <p className="text-sm text-muted-foreground">
                      {t("notifications.manualDescription")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handlePreviewTaskEmail}
                    disabled={isLoadingTaskEmailPreview}
                    aria-busy={isLoadingTaskEmailPreview}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    {isLoadingTaskEmailPreview ? (
                      <Spinner aria-hidden="true" data-icon="inline-start" />
                    ) : (
                      <Mail data-icon="inline-start" />
                    )}
                    {t(
                      isLoadingTaskEmailPreview
                        ? "notifications.loadingRecipients"
                        : "notifications.send",
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </FormSection>
          ) : null}

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

      <AlertDialog
        open={confirmTaskEmailOpen}
        onOpenChange={(nextOpen) => {
          if (!isSendingTaskEmail) {
            setConfirmTaskEmailOpen(nextOpen);
            if (!nextOpen) setTaskEmailRequestId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("notifications.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("notifications.confirmDescription", {
                title: taskEmailPreview?.title ?? entry.title,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            {taskEmailPreview?.recipients.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {taskEmailPreview.recipients.map((recipient) => (
                  <li key={recipient.workerId}>
                    <span className="font-medium">{recipient.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      &lt;{recipient.email}&gt;
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Alert>
                <AlertDescription>
                  {t("notifications.noRecipients")}
                </AlertDescription>
              </Alert>
            )}
            {(taskEmailPreview?.excludedRecipients.length ?? 0) > 0 && (
              <Alert>
                <AlertDescription>
                  {t("notifications.excludedRecipients", {
                    names:
                      taskEmailPreview?.excludedRecipients
                        .map(({ name }) => name)
                        .join(", ") ?? "",
                  })}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSendingTaskEmail}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              onClick={handleSendTaskEmail}
              disabled={
                isSendingTaskEmail ||
                !taskEmailPreview?.recipients.length
              }
              aria-busy={isSendingTaskEmail}
            >
              {isSendingTaskEmail && (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              )}
              {t(
                isSendingTaskEmail
                  ? "notifications.sending"
                  : "notifications.confirmSend",
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
