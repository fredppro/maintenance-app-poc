"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { getValidLocale } from "src/i18n/locale";
import { createTask } from "../server/actions";
import { useSchedulerStore } from "../store/scheduler-provider";
import { useRouter } from "@/i18n/routing";
import { zodResolver } from "@hookform/resolvers/zod";
import { areIntervalsOverlapping } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { TaskType } from "../../../../prisma/generated/prisma/enums";
import {
  getDefaultMaintenanceStartTime,
  getTaskDisplayEnd,
} from "../utils/schedule";
import { inferWorkLogStartTimes } from "../utils/worker-hours";
import {
  EntrySheet,
  FieldError,
  FormSection,
  ChecklistEditor,
  type ChecklistFormValue,
  DailyHoursEditor,
  dailyHoursFormSchema,
  MaintenancePointField,
  MaterialsEditor,
  materialSchema,
  ScheduleFields,
} from "./entry-form-parts";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  type: z.nativeEnum(TaskType),
  equipmentId: z.string().min(1, "Equipment is required"),
  maintenancePointId: z.string().nullable().optional(),
  startTime: z.date(),
  endTimeKnown: z.boolean(),
  endTime: z.date().nullable(),
  workerIds: z.array(z.string()).min(1, "Select at least one worker"),
  dailyHours: z.array(dailyHoursFormSchema).optional(),
  materials: z.array(materialSchema).optional(),
}).superRefine((data, ctx) => {
  if (data.endTimeKnown && !data.endTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "End time is required when the end time is known",
    });
  } else if (data.endTime && data.endTime <= data.startTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "Task end time must be after start time",
    });
  }
});

type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

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
  const addEntry = useSchedulerStore((state) => state.addEntry);
  const equipment = useSchedulerStore((state) => state.equipment);
  const workers = useSchedulerStore((state) => state.workers);
  const timeZone = useSchedulerStore((state) => state.timeZone);
  const router = useRouter();
  const entries = useSchedulerStore((state) => state.entries);

  const locale = getValidLocale(useLocale());
  const t = useTranslations("Form");
  const tCommon = useTranslations("Common");

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      type: TaskType.PREVENTIVE,
      equipmentId: "",
      maintenancePointId: null,
      startTime: getDefaultMaintenanceStartTime(timeZone),
      endTimeKnown: false,
      endTime: null,
      workerIds: [],
      dailyHours: [],
      materials: [],
    },
  });

  const watchEquipmentId = useWatch({ control: form.control, name: "equipmentId" });
  const watchMaintenancePointId = useWatch({
    control: form.control,
    name: "maintenancePointId",
  });
  const watchStartTime = useWatch({ control: form.control, name: "startTime" });
  const watchEndTime = useWatch({ control: form.control, name: "endTime" });
  const watchEndTimeKnown = useWatch({
    control: form.control,
    name: "endTimeKnown",
  });
  const watchType = useWatch({ control: form.control, name: "type" });
  const watchWorkerIds = useWatch({ control: form.control, name: "workerIds" });
  const watchDailyHours = useWatch({ control: form.control, name: "dailyHours" });
  const [additionalDetailsOpen, setAdditionalDetailsOpen] = useState(false);
  const [checklistPreviewState, setChecklistPreviewState] = useState<{
    key: string;
    items: ChecklistFormValue[];
  }>({ key: "", items: [] });
  const checklistPreviewKey =
    `${open}:${watchEquipmentId}:${selectedCell?.date?.getTime() ?? ""}`;
  const checklistPreview =
    checklistPreviewState.key === checklistPreviewKey
      ? checklistPreviewState.items
      : [];

  const hasConflict = useMemo(() => {
    if (!watchEquipmentId || !watchStartTime) {
      return false;
    }

    return entries.some((entry) => {
      if (entry.equipmentId !== watchEquipmentId) return false;

      return areIntervalsOverlapping(
        {
          start: watchStartTime,
          end: getTaskDisplayEnd(
            watchStartTime,
            watchEndTimeKnown ? watchEndTime : null,
          ),
        },
        {
          start: new Date(entry.startTime),
          end: getTaskDisplayEnd(entry.startTime, entry.endTime),
        },
      );
    });
  }, [entries, watchEquipmentId, watchStartTime, watchEndTime, watchEndTimeKnown]);

  const selectedCellDate = selectedCell?.date?.getTime();
  const selectedCellEquipmentId = selectedCell?.equipmentId;

  useEffect(() => {
    if (selectedCellDate !== undefined && open) {
      form.setValue("equipmentId", selectedCellEquipmentId ?? "");
      form.setValue("maintenancePointId", null);
      form.setValue("startTime", new Date(selectedCellDate));
    }
  }, [selectedCellDate, selectedCellEquipmentId, open, form]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setChecklistPreviewState({ key: "", items: [] });
      setAdditionalDetailsOpen(false);
      form.clearErrors();
    }
    onOpenChange(nextOpen);
  };

  const onSubmit = async (values: FormValues) => {
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
      setAdditionalDetailsOpen(true);
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

    try {
      const { endTimeKnown, ...taskValues } = values;
      const newTask = await createTask({
        ...taskValues,
        endTime: endTimeKnown ? taskValues.endTime : null,
        status: "scheduled",
      });
      addEntry(newTask);
      toast.success(t("errors.success"));
      form.reset();
      handleOpenChange(false);
    } catch (error) {
      console.error("Failed to add entry:", error);
      form.setError("root.server", {
        type: "server",
        message: t("errors.failure"),
      });
      toast.error(t("errors.failure"));
    }
  };

  const handleSubmit = form.handleSubmit(onSubmit, (errors) => {
    if (errors.dailyHours || errors.materials) {
      setAdditionalDetailsOpen(true);
    }
  });

  const workerOptions = workers.map((w) => ({
    label: `${w.name} (${w.email})`,
    value: w.id,
  }));

  return (
    <EntrySheet
      open={open}
      onOpenChange={handleOpenChange}
      formId="add-entry-form"
      onSubmit={handleSubmit}
      title={t("schedule")}
      description={t("scheduleDescription")}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => handleOpenChange(false)}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="submit"
            form="add-entry-form"
            className="w-full sm:w-auto"
            disabled={form.formState.isSubmitting || hasConflict}
            aria-busy={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </>
      }
      onChange={() => form.clearErrors("root.server")}
    >
      <FieldGroup>
        {form.formState.errors.root?.server?.message && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              {form.formState.errors.root.server.message}
            </AlertDescription>
          </Alert>
        )}
        <FormSection title={t("sectionDetails")} showSeparator>
          <Field data-invalid={!!form.formState.errors.title || undefined}>
            <FieldLabel htmlFor="task-title">{t("title")}</FieldLabel>
            <Input
              id="task-title"
              autoFocus
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
              {...form.register("description")}
              placeholder={t("descriptionPlaceholder")}
              rows={3}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              data-invalid={
                !!form.formState.errors.equipmentId || hasConflict || undefined
              }
            >
              <FieldLabel htmlFor="task-equipment">{t("equipment")}</FieldLabel>
              <Select
                value={watchEquipmentId}
                onValueChange={(v) => {
                  form.setValue("equipmentId", v, { shouldValidate: true })
                  form.setValue("maintenancePointId", null, {
                    shouldDirty: true,
                  });
                }}
              >
                <SelectTrigger
                  id="task-equipment"
                  className="w-full"
                  aria-required="true"
                  aria-invalid={
                    !!form.formState.errors.equipmentId || hasConflict || undefined
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
                  {equipment.map((equip) => (
                    <SelectItem key={equip.id} value={equip.id}>
                      {equip.name}
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
                onValueChange={(v) => form.setValue("type", v as TaskType)}
              >
                <SelectTrigger
                  id="task-type"
                  className="w-full"
                  aria-required="true"
                >
                  <SelectValue placeholder={t("selectType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TaskType.PREVENTIVE}>
                    {t("preventive")}
                  </SelectItem>
                  <SelectItem value={TaskType.PREDICTIVE}>
                    {t("predictive")}
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
          />
        </FormSection>

        <ChecklistEditor
          value={checklistPreview}
          readOnly
          maintenancePointField={
            <MaintenancePointField
              key={`${watchEquipmentId}-${open}`}
              equipmentId={watchEquipmentId}
              open={open}
              value={watchMaintenancePointId}
              onChange={(value, items) => {
                form.setValue("maintenancePointId", value, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
                setChecklistPreviewState({
                  key: checklistPreviewKey,
                  items,
                });
              }}
            />
          }
        />

        <FormSection title={t("sectionTeam")} showSeparator>
          <Field data-invalid={!!form.formState.errors.workerIds || undefined}>
            <FieldLabel htmlFor="task-workers">{t("assignedWorkers")}</FieldLabel>
            <MultiSelect
              id="task-workers"
              aria-label={t("assignedWorkers")}
              aria-required
              aria-invalid={!!form.formState.errors.workerIds || undefined}
              aria-describedby={
                form.formState.errors.workerIds ? "task-workers-error" : undefined
              }
              options={workerOptions}
              selected={watchWorkerIds}
              onChange={(v) =>
                form.setValue("workerIds", v, { shouldValidate: true })
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
                  handleOpenChange(false);
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

        <Accordion
          type="single"
          collapsible
          value={additionalDetailsOpen ? "optional-details" : ""}
          onValueChange={(value) =>
            setAdditionalDetailsOpen(value === "optional-details")
          }
          className="rounded-md border px-3"
        >
          <AccordionItem
            value="optional-details"
            className="border-b-0"
          >
            <AccordionTrigger className="py-3 hover:no-underline">
              {t("additionalDetails")}
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-6">
              <DailyHoursEditor
                value={watchDailyHours ?? []}
                workers={workers}
                assignedWorkerIds={watchWorkerIds}
                startTime={watchStartTime}
                locale={locale}
                timeZone={timeZone}
                showValidationErrors={form.formState.submitCount > 0}
                onChange={(dailyHours) =>
                  form.setValue("dailyHours", dailyHours, {
                    shouldValidate: true,
                  })
                }
              />
              <MaterialsEditor form={form} locale={locale} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </FieldGroup>
    </EntrySheet>
  );
}
