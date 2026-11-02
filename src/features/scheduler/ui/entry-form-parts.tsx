"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
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
import { getMaintenancePoints } from "../server/actions";
import { addMinutes, differenceInMinutes } from "date-fns";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  type UseFormReturn,
} from "react-hook-form";
import { useEffect, useState } from "react";
import {
  dateOnlyAtNoonInTimeZone,
  formatDateOnlyInTimeZone,
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
  workerId: string;
  workDate: string;
  hours: number;
};

export function MaintenancePointField({
  equipmentId,
  open,
  value,
  onChange,
}: {
  equipmentId: string;
  open: boolean;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations("Form");
  const [points, setPoints] = useState<{ id: string; name: string }[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!open || !equipmentId) return () => {
      active = false;
    };

    getMaintenancePoints(equipmentId)
      .then((result) => {
        if (active) {
          setPoints(result);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, [equipmentId, open]);

  return (
    <Field>
      <FieldLabel htmlFor="task-maintenance-point">
        {t("maintenancePoint")}
      </FieldLabel>
      <Select
        value={value ?? "__none__"}
        onValueChange={(selected) =>
          onChange(selected === "__none__" ? null : selected)
        }
        disabled={!equipmentId}
      >
        <SelectTrigger id="task-maintenance-point" className="w-full">
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
      {loadFailed && (
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
}: {
  value: ChecklistFormValue[];
  onChange: (value: ChecklistFormValue[]) => void;
}) {
  const t = useTranslations("Form");
  return (
    <FormSection title={t("checklist.title")}>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("checklist.empty")}</p>
      ) : (
        <div className="space-y-2">
          {value.map((item, index) => (
            <label
              key={item.id}
              className="flex items-center gap-3 rounded-md border p-3 text-sm"
            >
              <Checkbox
                checked={item.isComplete}
                onCheckedChange={(checked) =>
                  onChange(
                    value.map((current, currentIndex) =>
                      currentIndex === index
                        ? { ...current, isComplete: checked === true }
                        : current,
                    ),
                  )
                }
              />
              <span className={item.isComplete ? "line-through text-muted-foreground" : ""}>
                {item.title}
              </span>
            </label>
          ))}
        </div>
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
  onChange,
}: {
  value: DailyHoursFormValue[];
  workers: { id: string; name: string }[];
  assignedWorkerIds: string[];
  startTime: Date;
  locale: AppLocale;
  timeZone: string;
  onChange: (value: DailyHoursFormValue[]) => void;
}) {
  const t = useTranslations("Form");
  const date = formatDateOnlyInTimeZone(startTime, timeZone);
  const totals = new Map<string, number>();
  for (const row of value) {
    totals.set(row.workerId, (totals.get(row.workerId) ?? 0) + row.hours);
  }
  const totalHours = value.reduce((sum, row) => sum + row.hours, 0);

  const addWorkDay = () => {
    const workerIds = assignedWorkerIds.length > 0 ? assignedWorkerIds : [""];
    onChange([
      ...value,
      ...workerIds.map((workerId) => ({ workerId, workDate: date, hours: 0 })),
    ]);
  };

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
      action={
        <Button type="button" size="sm" variant="outline" onClick={addWorkDay}>
          <Plus className="size-4" />
          {t("dailyHours.addDay")}
        </Button>
      }
    >
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dailyHours.empty")}</p>
      ) : (
        <div className="space-y-2">
          {value.map((row, index) => (
            <div
              key={`${row.workerId}-${row.workDate}-${index}`}
              className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto]"
            >
              <Select
                value={row.workerId || undefined}
                onValueChange={(workerId) => updateRow(index, { workerId })}
              >
                <SelectTrigger aria-label={t("dailyHours.worker")}>
                  <SelectValue placeholder={t("dailyHours.selectWorker")} />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateTimePicker
                date={dateOnlyAtNoonInTimeZone(row.workDate, timeZone)}
                setDate={(nextDate) =>
                  updateRow(index, {
                    workDate: formatDateOnlyInTimeZone(nextDate, timeZone),
                  })
                }
                locale={locale}
                timeZone={timeZone}
                showTime={false}
                ariaLabel={t("dailyHours.date")}
                placeholder={t("pickDate")}
              />
              <Input
                type="number"
                min={0.25}
                max={24}
                step={0.25}
                aria-label={t("dailyHours.hours")}
                value={row.hours || ""}
                onChange={(event) =>
                  updateRow(index, { hours: Number(event.target.value) || 0 })
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("dailyHours.remove")}
                onClick={() =>
                  onChange(value.filter((_, rowIndex) => rowIndex !== index))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
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
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-xl lg:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-4 py-3 pr-14 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="text-base">{title}</SheetTitle>
            {meta}
          </div>
          <SheetDescription className="text-xs">{description}</SheetDescription>
        </SheetHeader>

        <form
          id={formId}
          onSubmit={onSubmit}
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
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
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

  const applyDuration = (minutes: number) => {
    if (!start) return;
    f.setValue("endTime", addMinutes(start, minutes), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="task-start-time">
          {t("startDateTime")}
        </FieldLabel>
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
                    f.setValue(
                      "endTime",
                      new Date(
                        next.getTime() +
                          currentEnd.getTime() -
                          field.value.getTime(),
                      ),
                      { shouldDirty: true, shouldValidate: true },
                    );
                  }
                }
                field.onChange(next);
              }}
              locale={locale}
              timeZone={timeZone}
              id="task-start-time"
              placeholder={t("pickDate")}
              hasError={hasConflict || !!startError}
            />
          )}
        />
        <FieldError message={startError} />
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
        <Field>
          <FieldLabel htmlFor="task-end-time">
            {t("endDateTime")}
          </FieldLabel>
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
                hasError={!!endError}
              />
            )}
          />
          <FieldError message={endError} />
        </Field>
      )}

      {endTimeKnown && (
        <div
          role="group"
          aria-label={t("duration")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="mr-1 text-xs text-muted-foreground">
            {t("duration")}
          </span>
          {DURATION_PRESETS.map((preset) => {
            const active = durationMinutes === preset.minutes;
            const label =
              preset.unit === "minutes"
                ? t("durationMinutes", { count: preset.count })
                : preset.unit === "hours"
                  ? t("durationHours", { count: preset.count })
                  : t("durationDays", { count: preset.count });
            return (
              <Button
                key={preset.minutes}
                type="button"
                size="sm"
                variant={active ? "secondary" : "outline"}
                aria-pressed={active}
                onClick={() => applyDuration(preset.minutes)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t("timesUseOrganizationTimezone", { timeZone })}
      </p>

      {hasConflict && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive animate-in fade-in duration-200"
        >
          <AlertCircle className="size-4 shrink-0" />
          <p className="text-xs font-medium">{t("errors.conflict")}</p>
        </div>
      )}
    </div>
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
              <div className="col-span-6 flex flex-col gap-1 sm:col-span-3">
                <FieldLabel className="text-xs" htmlFor={`material-name-${index}`}>
                  {t("itemName")}
                </FieldLabel>
                <Input
                  id={`material-name-${index}`}
                  aria-label={`${t("itemName")} ${index + 1}`}
                  placeholder={t("itemName")}
                  className="h-8 text-sm"
                  {...f.register(`materials.${index}.name` as const)}
                />
                <FieldError message={errors?.[index]?.name?.message} />
              </div>

              <div className="col-span-6 flex flex-col gap-1 sm:col-span-3">
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
              </div>

              <div className="col-span-2 flex flex-col gap-1">
                <FieldLabel className="text-xs" htmlFor={`material-qty-${index}`}>
                  {t("quantity")}
                </FieldLabel>
                <Input
                  id={`material-qty-${index}`}
                  aria-label={`${t("quantity")} ${index + 1}`}
                  type="number"
                  step="0.1"
                  className="h-8 text-right text-sm tabular-nums"
                  {...f.register(`materials.${index}.quantity` as const, {
                    valueAsNumber: true,
                  })}
                />
                <FieldError message={errors?.[index]?.quantity?.message} />
              </div>

              <div className="col-span-2 flex flex-col gap-1">
                <FieldLabel className="text-xs">{t("unit")}</FieldLabel>
                <Controller
                  control={f.control}
                  name={`materials.${index}.unit` as const}
                  render={({ field: unitField }) => (
                    <SearchableSelect
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
              </div>

              <div className="col-span-2 flex flex-col gap-1">
                <FieldLabel className="text-xs" htmlFor={`material-price-${index}`}>
                  {t("price")}
                </FieldLabel>
                <InputGroup className="h-8">
                  <InputGroupInput
                    id={`material-price-${index}`}
                    aria-label={`${t("price")} ${index + 1}`}
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
                <FieldError message={errors?.[index]?.price?.message} />
              </div>

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
