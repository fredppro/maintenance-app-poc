"use client";

import { Button } from "@/components/ui/button";
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
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { TaskType } from "../../../../prisma/generated/prisma/enums";
import {
  getDefaultMaintenanceStartTime,
  getTaskDisplayEnd,
} from "../utils/schedule";
import {
  EntrySheet,
  FieldError,
  FormSection,
  DailyHoursEditor,
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
  dailyHours: z
    .array(
      z.object({
        workerId: z.string().min(1),
        workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hours: z.number().min(0.25).max(24).multipleOf(0.25),
      }),
    )
    .optional(),
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

  useEffect(() => {
    if (selectedCell && open) {
      form.setValue("equipmentId", selectedCell.equipmentId);
      form.setValue("maintenancePointId", null);
      const start = new Date(selectedCell.date);
      form.setValue("startTime", start);
    }
  }, [selectedCell, open, form]);

  const onSubmit = async (values: FormValues) => {
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
    <EntrySheet
      open={open}
      onOpenChange={onOpenChange}
      formId="add-entry-form"
      onSubmit={form.handleSubmit(onSubmit)}
      title={t("schedule")}
      description={t("scheduleDescription")}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="submit"
            form="add-entry-form"
            disabled={form.formState.isSubmitting || hasConflict}
            aria-busy={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <FormSection title={t("sectionDetails")}>
          <Field>
            <FieldLabel htmlFor="task-title">{t("title")}</FieldLabel>
            <Input
              id="task-title"
              autoFocus
              {...form.register("title")}
              placeholder={t("titlePlaceholder")}
            />
            <FieldError message={form.formState.errors.title?.message} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="task-equipment">{t("equipment")}</FieldLabel>
              <Select
                value={watchEquipmentId}
                onValueChange={(v) => {
                  form.setValue("equipmentId", v, { shouldValidate: true })
                  form.setValue("maintenancePointId", null)
                }}
              >
                <SelectTrigger
                  id="task-equipment"
                  className="w-full"
                  aria-invalid={hasConflict || undefined}
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
              <FieldError message={form.formState.errors.equipmentId?.message} />
            </Field>

            <Field>
              <FieldLabel htmlFor="task-type">{t("taskType")}</FieldLabel>
              <Select
                value={watchType}
                onValueChange={(v) => form.setValue("type", v as TaskType)}
              >
                <SelectTrigger id="task-type" className="w-full">
                  <SelectValue placeholder={t("selectType")} />
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
                shouldValidate: true,
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
          />
        </FormSection>

        <FormSection title={t("sectionTeam")}>
          <Field>
            <FieldLabel htmlFor="task-workers">{t("assignedWorkers")}</FieldLabel>
            <MultiSelect
              id="task-workers"
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
                  onOpenChange(false);
                  router.push("/workers");
                },
              }}
            />
            <FieldError message={form.formState.errors.workerIds?.message} />
          </Field>
          <Field>
            <FieldLabel htmlFor="task-description">{t("description")}</FieldLabel>
            <Textarea
              id="task-description"
              {...form.register("description")}
              placeholder={t("descriptionPlaceholder")}
              rows={3}
            />
          </Field>
        </FormSection>

        <DailyHoursEditor
          value={watchDailyHours ?? []}
          workers={workers}
          assignedWorkerIds={watchWorkerIds}
          startTime={watchStartTime ?? new Date()}
          locale={locale}
          timeZone={timeZone}
          onChange={(dailyHours) =>
            form.setValue("dailyHours", dailyHours, { shouldValidate: true })
          }
        />

        <MaterialsEditor form={form} locale={locale} />
      </FieldGroup>
    </EntrySheet>
  );
}
