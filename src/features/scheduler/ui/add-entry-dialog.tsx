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
import { addHours, areIntervalsOverlapping } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { TaskType } from "../../../../prisma/generated/prisma/enums";
import {
  EntrySheet,
  FieldError,
  FormSection,
  MaterialsEditor,
  materialSchema,
  ScheduleFields,
} from "./entry-form-parts";

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
  const addEntry = useSchedulerStore((state) => state.addEntry);
  const equipment = useSchedulerStore((state) => state.equipment);
  const workers = useSchedulerStore((state) => state.workers);
  const router = useRouter();
  const entries = useSchedulerStore((state) => state.entries);

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

  const watchEquipmentId = useWatch({ control: form.control, name: "equipmentId" });
  const watchStartTime = useWatch({ control: form.control, name: "startTime" });
  const watchEndTime = useWatch({ control: form.control, name: "endTime" });
  const watchType = useWatch({ control: form.control, name: "type" });
  const watchWorkerIds = useWatch({ control: form.control, name: "workerIds" });

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
      const newTask = await createTask({
        ...values,
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
                onValueChange={(v) =>
                  form.setValue("equipmentId", v, { shouldValidate: true })
                }
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

        <MaterialsEditor form={form} locale={locale} />
      </FieldGroup>
    </EntrySheet>
  );
}
