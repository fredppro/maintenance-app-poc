"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { IconButton } from "@/components/ui/icon-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Field,
  FieldDescription,
  FieldError as ShadcnFieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getCurrencySymbol } from "@/features/scheduler/utils/currency";
import {
  calculateWorkLogEnd,
  inferWorkLogStartTimes,
} from "@/features/scheduler/utils/worker-hours";
import {
  calculatePlannedEndTime,
  shiftPlannedEndTime,
} from "@/features/scheduler/utils/schedule";
import { getMaintenancePoints } from "../server/actions";
import { differenceInMinutes } from "date-fns";
import { AlertCircle, Clock, Info, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  type UseFormReturn,
} from "react-hook-form";
import { useEffect, useState } from "react";
import {
  formatTimeInTimeZone,
  formatDateOnlyInTimeZone,
  fromZonedDateAndTime,
} from "@/lib/time-zone";
import * as z from "zod";
import { MaterialUnit } from "../../../../prisma/generated/prisma/enums";
import type { AppLocale } from "src/i18n/locale";

export const materialSchema = z.object({
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

export type MaterialFormValue = z.infer<typeof materialSchema>;

export const emptyMaterial: MaterialFormValue = {
  name: "",
  reference: "",
  quantity: 1,
  unit: MaterialUnit.PC,
  price: undefined,
};

export type DailyHoursFormValue = {
  id?: string;
  workerId: string;
  workDate: string;
  startTime: string | null;
  hours: number;
};

export const dailyHoursFormSchema = z
  .object({
    id: z.string().min(1).optional(),
    workerId: z.string().min(1, "Select a worker"),
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a work date"),
    startTime: z
      .union([z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), z.literal("")])
      .nullable(),
    hours: z.number().min(0.25).max(24).multipleOf(0.25),
  });

export function FieldInfoTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="size-6 p-0 text-muted-foreground pointer-coarse:size-10"
        >
          <Info />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function MaintenancePointField({
  equipmentId,
  open,
  value,
  onChange,
}: {
  equipmentId: string;
  open: boolean;
  value: string | null | undefined;
  onChange: (
    value: string | null,
    checklistItems: ChecklistFormValue[],
  ) => void;
}) {
  const t = useTranslations("Form");
  const [pointState, setPointState] = useState<{
    equipmentId: string;
    points: {
      id: string;
      name: string;
      checklistItems?: { id: string; title: string; sortOrder: number }[];
    }[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (!open || !equipmentId) return () => { active = false; };

    getMaintenancePoints(equipmentId)
      .then((result) => {
        if (active) {
          setPointState({ equipmentId, points: result, failed: false });
        }
      })
      .catch(() => {
        if (active) setPointState({ equipmentId, points: [], failed: true });
      });

    return () => {
      active = false;
    };
  }, [equipmentId, open]);

  const currentPointState =
    pointState?.equipmentId === equipmentId ? pointState : null;
  const points = currentPointState?.points ?? [];
  const isLoading = open && Boolean(equipmentId) && !currentPointState;

  return (
    <Field>
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor="task-maintenance-point">
          {t("maintenancePoint")}
        </FieldLabel>
        <FieldInfoTooltip label={t("maintenancePointInfoLabel")}>
          {t("maintenancePointHelp")}
        </FieldInfoTooltip>
      </div>
      <Select
        value={value ?? "__none__"}
        onValueChange={(selected) => {
          const point =
            selected === "__none__"
              ? undefined
              : points.find(({ id }) => id === selected);
          onChange(
            point?.id ?? null,
            (point?.checklistItems ?? []).map((item) => ({
              id: item.id,
              title: item.title,
              sortOrder: item.sortOrder,
              isComplete: false,
            })),
          );
        }}
        disabled={!equipmentId || isLoading || currentPointState?.failed}
      >
        <SelectTrigger
          id="task-maintenance-point"
          className="w-full"
          aria-busy={isLoading}
        >
          <SelectValue placeholder={t("maintenancePoint")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t("noMaintenancePoint")}</SelectItem>
          {points.map((point) => (
            <SelectItem key={point.id} value={point.id}>
              {point.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isLoading && (
        <FieldDescription>{t("loadingMaintenancePoints")}</FieldDescription>
      )}
      {currentPointState?.failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("maintenancePointLoadFailure")}
        </p>
      )}
    </Field>
  );
}

export type ChecklistFormValue = {
  id: string;
  title: string;
  sortOrder: number;
  isComplete: boolean;
};

export function ChecklistEditor({
  value,
  onChange,
  maintenancePointField,
  readOnly = false,
}: {
  value: ChecklistFormValue[];
  onChange?: (value: ChecklistFormValue[]) => void;
  maintenancePointField?: ReactNode;
  readOnly?: boolean;
}) {
  const t = useTranslations("Form");
  const completedCount = value.filter((item) => item.isComplete).length;
  return (
    <FormSection title={t("checklist.title")} showSeparator>
      {maintenancePointField}
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("checklist.empty")}</p>
      ) : (
        <Accordion
          type="single"
          collapsible
          defaultValue={readOnly ? undefined : "checklist-items"}
          className="rounded-md border px-3"
        >
          <AccordionItem value="checklist-items" className="border-b-0">
            <AccordionTrigger className="py-3 hover:no-underline">
              <span>{t("checklist.items")}</span>
              <Badge
                variant={completedCount === value.length ? "success" : "secondary"}
                className="ml-auto mr-2 tabular-nums"
              >
                {t("checklist.progress", {
                  completed: completedCount,
                  total: value.length,
                })}
              </Badge>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              <div className="flex flex-col gap-2">
                {value.map((item, index) => (
                  <label
                    key={item.id}
                    className="flex min-h-11 items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={item.isComplete}
                      disabled={readOnly}
                      onCheckedChange={(checked) =>
                        onChange?.(
                          value.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, isComplete: checked === true }
                              : current,
                          ),
                        )
                      }
                    />
                    <span
                      className={
                        item.isComplete
                          ? "line-through text-muted-foreground"
                          : ""
                      }
                    >
                      {item.title}
                    </span>
                  </label>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </FormSection>
  );
}

export function DailyHoursEditor({
  value,
  workers,
  assignedWorkerIds,
  startTime,
  locale,
  timeZone,
  showValidationErrors = false,
  onChange,
}: {
  value: DailyHoursFormValue[];
  workers: { id: string; name: string }[];
  assignedWorkerIds: string[];
  startTime: Date;
  locale: AppLocale;
  timeZone: string;
  showValidationErrors?: boolean;
  onChange: (value: DailyHoursFormValue[]) => void;
}) {
  const t = useTranslations("Form");
  const date = formatDateOnlyInTimeZone(startTime, timeZone);
  const workerOptions = workers
    .filter((worker) => assignedWorkerIds.includes(worker.id))
    .map((worker) => ({ label: worker.name, value: worker.id }));
  const totals = new Map<string, number>();
  for (const row of value) {
    if (row.workerId) {
      totals.set(row.workerId, (totals.get(row.workerId) ?? 0) + row.hours);
    }
  }
  const totalHours = value.reduce((sum, row) => sum + row.hours, 0);
  const inferredStarts = inferWorkLogStartTimes(value, startTime, timeZone);

  const addWorkLog = () =>
    onChange([
      ...value,
      { workerId: "", workDate: date, startTime: "", hours: 0 },
    ]);

  const updateRow = (index: number, patch: Partial<DailyHoursFormValue>) => {
    onChange(
      value.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  return (
    <FormSection
      title={t("dailyHours.title")}
      showSeparator
      action={
        <Button type="button" size="sm" variant="outline" onClick={addWorkLog}>
          <Plus data-icon="inline-start" />
          {t("dailyHours.logWork")}
        </Button>
      }
    >
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dailyHours.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {value.map((row, index) => {
            const inferredStart = inferredStarts[index];
            const previewWorkDate = row.startTime
              ? row.workDate
              : inferredStart?.workDate ?? row.workDate;
            const previewStartTime =
              row.startTime || inferredStart?.startTime || "";
            const calculatedEnd = calculateWorkLogEnd(
              previewWorkDate,
              previewStartTime,
              row.hours,
              timeZone,
            );
            const hasUnresolvedStart =
              !row.id && Boolean(row.workerId) && !row.startTime && !inferredStart;
            const durationInputId = `work-log-duration-${index}`;
            const workerErrorId = `work-log-worker-error-${index}`;
            const startErrorId = `work-log-start-error-${index}`;
            const durationErrorId = `work-log-duration-error-${index}`;
            const workerInputId = `work-log-worker-${index}`;
            const startInputId = `work-log-start-${index}`;
            const calculatedEndId = `work-log-end-preview-${index}`;
            return (
              <div
                key={row.id ?? index}
                className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-medium">
                    #{index + 1}
                  </h4>
                  <IconButton
                    label={t("dailyHours.remove")}
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      onChange(
                        value.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    <Trash2 />
                  </IconButton>
                </div>
                <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    data-invalid={
                      showValidationErrors && !row.workerId ? true : undefined
                    }
                  >
                    <FieldLabel htmlFor={workerInputId}>
                      {t("dailyHours.worker")}
                    </FieldLabel>
                    <SearchableSelect
                      id={workerInputId}
                      aria-required
                      aria-invalid={
                        showValidationErrors && !row.workerId || undefined
                      }
                      aria-describedby={
                        showValidationErrors && !row.workerId
                          ? workerErrorId
                          : undefined
                      }
                      options={workerOptions}
                      value={row.workerId || undefined}
                      onChange={(workerId) => updateRow(index, { workerId })}
                      placeholder={t("dailyHours.selectWorker")}
                      searchPlaceholder={t("searchWorkers")}
                      emptyText={t("noWorkerFound")}
                    />
                    {showValidationErrors && !row.workerId && (
                      <FieldError
                        id={workerErrorId}
                        message={t("dailyHours.workerRequired")}
                      />
                    )}
                  </Field>
                  <Field
                    data-invalid={
                      showValidationErrors && hasUnresolvedStart
                        ? true
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-1">
                      <FieldLabel htmlFor={startInputId}>
                        {t("dailyHours.startDateTime")}
                      </FieldLabel>
                      <FieldInfoTooltip
                        label={t("dailyHours.inferredStartInfoLabel")}
                      >
                        {t("dailyHours.inferredStartHelp")}
                      </FieldInfoTooltip>
                    </div>
                    <DateTimePicker
                      date={fromZonedDateAndTime(
                        previewWorkDate,
                        previewStartTime || "00:00",
                        timeZone,
                      )}
                      setDate={(nextDate) =>
                        updateRow(index, {
                          workDate: formatDateOnlyInTimeZone(nextDate, timeZone),
                          ...(row.startTime
                            ? {
                                startTime: formatTimeInTimeZone(
                                  nextDate,
                                  timeZone,
                                ),
                              }
                            : {}),
                        })
                      }
                      onTimeChange={(startTime) =>
                        updateRow(index, { startTime })
                      }
                      locale={locale}
                      timeZone={timeZone}
                      id={startInputId}
                      aria-describedby={
                        showValidationErrors && hasUnresolvedStart
                          ? startErrorId
                          : undefined
                      }
                      placeholder={t("pickDate")}
                      hasError={showValidationErrors && hasUnresolvedStart}
                    />
                    {!row.id && !row.startTime && inferredStart && (
                      <FieldDescription>
                        {t("dailyHours.inferredStart", {
                          time: inferredStart.startTime,
                        })}
                      </FieldDescription>
                    )}
                    {showValidationErrors && hasUnresolvedStart && (
                      <FieldError
                        id={startErrorId}
                        message={t("dailyHours.startTimeRequired")}
                      />
                    )}
                  </Field>
                  <Field
                    data-invalid={
                      showValidationErrors &&
                      (row.hours < 0.25 ||
                        row.hours > 24 ||
                        row.hours * 4 !== Math.round(row.hours * 4))
                        ? true
                        : undefined
                    }
                  >
                    <FieldLabel htmlFor={durationInputId}>
                      {t("dailyHours.duration")}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={durationInputId}
                        type="number"
                        min={0.25}
                        max={24}
                        step={0.25}
                        aria-required="true"
                        aria-invalid={
                          showValidationErrors &&
                          (row.hours < 0.25 ||
                            row.hours > 24 ||
                            row.hours * 4 !== Math.round(row.hours * 4))
                            ? true
                            : undefined
                        }
                        aria-describedby={
                          showValidationErrors &&
                          (row.hours < 0.25 ||
                            row.hours > 24 ||
                            row.hours * 4 !== Math.round(row.hours * 4))
                            ? durationErrorId
                            : undefined
                        }
                        aria-label={t("dailyHours.duration")}
                        value={row.hours || ""}
                        onChange={(event) =>
                          updateRow(index, {
                            hours: Number(event.target.value) || 0,
                          })
                        }
                      />
                      <InputGroupAddon align="inline-end" aria-hidden="true">
                        <Clock />
                      </InputGroupAddon>
                    </InputGroup>
                    {showValidationErrors &&
                      (row.hours < 0.25 ||
                        row.hours > 24 ||
                        row.hours * 4 !== Math.round(row.hours * 4)) && (
                        <FieldError
                          id={durationErrorId}
                          message={t("dailyHours.durationInvalid")}
                        />
                      )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={calculatedEndId}>
                      {t("dailyHours.calculatedEndLabel")}
                    </FieldLabel>
                    <output
                      id={calculatedEndId}
                      className="flex min-h-9 items-center text-sm font-medium tabular-nums"
                      aria-live="polite"
                    >
                      {calculatedEnd
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone,
                          }).format(calculatedEnd)
                        : (
                            <span className="text-muted-foreground">
                              {t("dailyHours.endPreview")}
                            </span>
                          )}
                    </output>
                  </Field>
                </FieldGroup>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">
          {t("dailyHours.total")}: {totalHours.toLocaleString()} h
        </span>
        {[...totals.entries()].map(([workerId, hours]) => (
          <span key={workerId} className="text-muted-foreground">
            {workers.find((worker) => worker.id === workerId)?.name ??
              t("dailyHours.unknownWorker")}
            : {hours.toLocaleString()} h
          </span>
        ))}
      </div>
    </FormSection>
  );
}

/** Shared create/edit surface: side panel on tablet/desktop, full screen on mobile. */
export function EntrySheet({
  open,
  onOpenChange,
  title,
  description,
  meta,
  footer,
  children,
  formId,
  onSubmit,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  meta?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  formId: string;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onChange?: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-xl lg:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-4 py-3 pr-14 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-lg">{title}</SheetTitle>
            {meta}
          </div>
          <SheetDescription className="text-sm leading-5">
            {description}
          </SheetDescription>
        </SheetHeader>

        <form
          id={formId}
          onSubmit={onSubmit}
          onChange={onChange}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-6"
        >
          {children}
        </form>

        <SheetFooter className="mt-0 flex-col-reverse gap-2 border-t border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {footer}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function FormSection({
  title,
  action,
  children,
  showSeparator = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  showSeparator?: boolean;
}) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {action}
        </div>
        {children}
      </section>
      {showSeparator && <Separator />}
    </>
  );
}

export function FieldError({
  id,
  message,
}: {
  id?: string;
  message?: string;
}) {
  if (!message) return null;
  return (
    <ShadcnFieldError
      id={id}
      className="font-medium"
    >
      {message}
    </ShadcnFieldError>
  );
}

interface ScheduleShape {
  startTime: Date;
  endTime: Date | null;
  endTimeKnown: boolean;
}

const DURATION_PRESETS = [
  { minutes: 30, unit: "minutes", count: 30 },
  { minutes: 60, unit: "hours", count: 1 },
  { minutes: 120, unit: "hours", count: 2 },
  { minutes: 240, unit: "hours", count: 4 },
  { minutes: 480, unit: "hours", count: 8 },
  { minutes: 1440, unit: "days", count: 1 },
] as const;

export function ScheduleFields<T extends ScheduleShape>({
  form,
  locale,
  hasConflict,
  startError,
  endError,
  timeZone,
}: {
  form: UseFormReturn<T>;
  locale: AppLocale;
  hasConflict: boolean;
  startError?: string;
  endError?: string;
  timeZone: string;
}) {
  const t = useTranslations("Form");
  const f = form as unknown as UseFormReturn<ScheduleShape>;
  const start = f.watch("startTime");
  const end = f.watch("endTime");
  const endTimeKnown = f.watch("endTimeKnown");
  const durationMinutes =
    start && end ? differenceInMinutes(end, start) : 0;
  const selectedDuration = DURATION_PRESETS.some(
    ({ minutes }) => minutes === durationMinutes,
  )
    ? String(durationMinutes)
    : "";

  const applyDuration = (minutes: number) => {
    if (!start) return;
    const plannedEnd = calculatePlannedEndTime(start, minutes);
    if (!plannedEnd) return;
    f.setValue("endTime", plannedEnd, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <FieldGroup className="gap-3">
      <Field data-invalid={hasConflict || !!startError || undefined}>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor="task-start-time">
            {t("startDateTime")}
          </FieldLabel>
          <FieldInfoTooltip label={t("timeZoneInfoLabel")}>
            {t("timesUseOrganizationTimezone", { timeZone })}
          </FieldInfoTooltip>
        </div>
        <Controller
          control={f.control}
          name="startTime"
          render={({ field }) => (
            <DateTimePicker
              date={field.value}
              setDate={(next) => {
                if (next && field.value) {
                  const currentEnd = f.getValues("endTime");
                  if (currentEnd) {
                    const shiftedEnd = shiftPlannedEndTime(
                      field.value,
                      currentEnd,
                      next,
                    );
                    if (shiftedEnd) {
                      f.setValue("endTime", shiftedEnd, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }
                }
                field.onChange(next);
              }}
              locale={locale}
              timeZone={timeZone}
              id="task-start-time"
              placeholder={t("pickDate")}
              aria-describedby={
                [
                  startError ? "task-start-time-error" : null,
                  hasConflict ? "task-schedule-conflict" : null,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              hasError={hasConflict || !!startError}
            />
          )}
        />
        <FieldError id="task-start-time-error" message={startError} />
      </Field>

      <Field orientation="horizontal">
        <Controller
          control={f.control}
          name="endTimeKnown"
          render={({ field }) => (
            <Checkbox
              id="task-end-time-known"
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked === true);
                if (checked !== true) {
                  f.setValue("endTime", null, { shouldValidate: true });
                }
              }}
            />
          )}
        />
        <FieldLabel htmlFor="task-end-time-known">
          {t("endTimeKnown")}
        </FieldLabel>
      </Field>

      {endTimeKnown && (
        <Field data-invalid={!!endError || undefined}>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="task-end-time">
              {t("endDateTime")}
            </FieldLabel>
            <FieldInfoTooltip label={t("timeZoneInfoLabel")}>
              {t("timesUseOrganizationTimezone", { timeZone })}
            </FieldInfoTooltip>
          </div>
          <Controller
            control={f.control}
            name="endTime"
            render={({ field }) => (
              <DateTimePicker
                date={field.value ?? undefined}
                setDate={field.onChange}
                locale={locale}
                timeZone={timeZone}
                id="task-end-time"
                placeholder={t("pickDate")}
                aria-describedby={endError ? "task-end-time-error" : undefined}
                hasError={!!endError}
              />
            )}
          />
          <FieldError id="task-end-time-error" message={endError} />
        </Field>
      )}

      {endTimeKnown && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={selectedDuration}
          aria-label={t("duration")}
          className="grid w-full grid-cols-3 sm:flex sm:w-fit"
          onValueChange={(value) => {
            if (value) applyDuration(Number(value));
          }}
        >
          {DURATION_PRESETS.map((preset) => {
            const label =
              preset.unit === "minutes"
                ? t("durationMinutes", { count: preset.count })
                : preset.unit === "hours"
                  ? t("durationHours", { count: preset.count })
                  : t("durationDays", { count: preset.count });
            return (
              <ToggleGroupItem
                key={preset.minutes}
                value={String(preset.minutes)}
                aria-label={label}
                className="h-9 px-2 text-xs pointer-coarse:h-10 sm:px-3"
              >
                {label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      )}

      {hasConflict && (
        <div
          id="task-schedule-conflict"
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive animate-in fade-in duration-200"
        >
          <AlertCircle className="size-4 shrink-0" />
          <p className="text-xs font-medium">{t("errors.conflict")}</p>
        </div>
      )}
    </FieldGroup>
  );
}

interface MaterialsShape {
  materials?: z.input<typeof materialSchema>[];
}

/** Responsive materials list: stacked cards on mobile, compact grid from sm. */
export function MaterialsEditor<
  T extends MaterialsShape,
  TTransformedValues = T,
>({
  form,
  locale,
}: {
  form: UseFormReturn<T, unknown, TTransformedValues>;
  locale: AppLocale;
}) {
  const t = useTranslations("Form");
  const f = form as unknown as UseFormReturn<MaterialsShape>;
  const { fields, append, remove } = useFieldArray({
    control: f.control,
    name: "materials",
  });
  const errors = f.formState.errors.materials;

  return (
    <FormSection
      title={t("materials")}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(emptyMaterial)}
        >
          <Plus data-icon="inline-start" />
          {t("addMaterial")}
        </Button>
      }
    >
      {fields.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          {t("noMaterials")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li
              key={field.id}
              className="grid grid-cols-6 gap-2 rounded-md border border-border bg-muted/20 p-3"
            >
              <div className="col-span-6 -mt-1 flex items-center justify-between">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  #{index + 1}
                </span>
                <RemoveMaterialButton
                  label={t("removeMaterial", { index: index + 1 })}
                  onClick={() => remove(index)}
                />
              </div>
              <Field
                className="col-span-6 gap-1 sm:col-span-3"
                data-invalid={!!errors?.[index]?.name || undefined}
              >
                <FieldLabel className="text-xs" htmlFor={`material-name-${index}`}>
                  {t("itemName")}
                </FieldLabel>
                <Input
                  id={`material-name-${index}`}
                  aria-label={`${t("itemName")} ${index + 1}`}
                  aria-required="true"
                  aria-invalid={!!errors?.[index]?.name || undefined}
                  aria-describedby={
                    errors?.[index]?.name ? `material-name-error-${index}` : undefined
                  }
                  placeholder={t("itemName")}
                  className="h-8 text-sm"
                  {...f.register(`materials.${index}.name` as const)}
                />
                <FieldError
                  id={`material-name-error-${index}`}
                  message={errors?.[index]?.name?.message}
                />
              </Field>

              <Field className="col-span-6 gap-1 sm:col-span-3">
                <FieldLabel className="text-xs" htmlFor={`material-ref-${index}`}>
                  {t("reference")}
                </FieldLabel>
                <Input
                  id={`material-ref-${index}`}
                  aria-label={`${t("reference")} ${index + 1}`}
                  placeholder={t("reference")}
                  className="h-8 text-sm"
                  {...f.register(`materials.${index}.reference` as const)}
                />
              </Field>

              <Field
                className="col-span-2 gap-1"
                data-invalid={!!errors?.[index]?.quantity || undefined}
              >
                <FieldLabel className="text-xs" htmlFor={`material-qty-${index}`}>
                  {t("quantity")}
                </FieldLabel>
                <Input
                  id={`material-qty-${index}`}
                  aria-label={`${t("quantity")} ${index + 1}`}
                  aria-required="true"
                  aria-invalid={!!errors?.[index]?.quantity || undefined}
                  aria-describedby={
                    errors?.[index]?.quantity
                      ? `material-quantity-error-${index}`
                      : undefined
                  }
                  type="number"
                  step="0.1"
                  className="h-8 text-right text-sm tabular-nums"
                  {...f.register(`materials.${index}.quantity` as const, {
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  id={`material-quantity-error-${index}`}
                  message={errors?.[index]?.quantity?.message}
                />
              </Field>

              <Field className="col-span-2 gap-1">
                <FieldLabel
                  className="text-xs"
                  htmlFor={`material-unit-${index}`}
                >
                  {t("unit")}
                </FieldLabel>
                <Controller
                  control={f.control}
                  name={`materials.${index}.unit` as const}
                  render={({ field: unitField }) => (
                    <SearchableSelect
                      id={`material-unit-${index}`}
                      value={unitField.value ?? MaterialUnit.PC}
                      onChange={unitField.onChange}
                      options={Object.values(MaterialUnit).map((unit) => ({
                        value: unit,
                        label: t(`materialUnits.${unit}`),
                      }))}
                      aria-label={`${t("unit")} ${index + 1}`}
                      placeholder={t("selectUnit")}
                      searchPlaceholder={t("searchUnit")}
                      emptyText={t("noUnitFound")}
                      className="h-8 text-sm"
                    />
                  )}
                />
              </Field>

              <Field
                className="col-span-2 gap-1"
                data-invalid={!!errors?.[index]?.price || undefined}
              >
                <FieldLabel className="text-xs" htmlFor={`material-price-${index}`}>
                  {t("price")}
                </FieldLabel>
                <InputGroup className="h-8">
                  <InputGroupInput
                    id={`material-price-${index}`}
                    aria-label={`${t("price")} ${index + 1}`}
                    aria-invalid={!!errors?.[index]?.price || undefined}
                    aria-describedby={
                      errors?.[index]?.price
                        ? `material-price-error-${index}`
                        : undefined
                    }
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="h-8 text-right text-sm tabular-nums"
                    {...f.register(`materials.${index}.price` as const, {
                      valueAsNumber: true,
                    })}
                  />
                  <InputGroupAddon
                    align="inline-end"
                    className="px-2 text-xs text-muted-foreground"
                  >
                    {getCurrencySymbol(locale)}
                  </InputGroupAddon>
                </InputGroup>
                <FieldError
                  id={`material-price-error-${index}`}
                  message={errors?.[index]?.price?.message}
                />
              </Field>

            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

function RemoveMaterialButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <IconButton label={label} variant="danger" size="sm" onClick={onClick}>
      <Trash2 />
    </IconButton>
  );
}
