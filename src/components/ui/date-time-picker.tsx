"use client";

import { format, isAfter, isBefore } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { APPLICATION_LOCALES } from "src/i18n/config";
import { AppLocale, LOCALE_MAP } from "src/i18n/locale";
import { cn } from "@/lib/utils";
import {
  fromZonedCalendarDate,
  toZonedCalendarDate,
} from "@/lib/time-zone";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

interface DateTimePickerProps {
  date?: Date;
  setDate: (date: Date) => void;
  onTimeChange?: (time: string) => void;
  locale: AppLocale;
  timeZone?: string;
  showTime?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  "aria-describedby"?: string;
  id?: string;
  hasError?: boolean;
  defaultMonth?: Date;
  disabled?: React.ComponentProps<typeof Calendar>["disabled"];
  minDate?: Date;
  maxDate?: Date;
}

export function DateTimePicker({
  date,
  setDate,
  onTimeChange,
  locale,
  timeZone,
  showTime = true,
  placeholder,
  ariaLabel,
  "aria-describedby": ariaDescribedBy,
  id,
  hasError,
  defaultMonth,
  disabled,
  minDate,
  maxDate,
}: DateTimePickerProps) {
  const t = useTranslations("Form");

  const appLocale = APPLICATION_LOCALES[locale];
  const dateFnsLocale = LOCALE_MAP[locale];
  const resolvedTimeZone =
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const anchorMonth = toZonedCalendarDate(
    defaultMonth || date || new Date(),
    resolvedTimeZone,
  );
  const calendarDate = date
    ? toZonedCalendarDate(date, resolvedTimeZone)
    : undefined;
  const dateParts = date
    ? {
        hour: calendarDate?.getHours() ?? 0,
        minute: calendarDate?.getMinutes() ?? 0,
      }
    : null;

  const [hours, setHoursState] = useState(
    dateParts ? String(dateParts.hour).padStart(2, "0") : "00",
  );
  const [minutes, setMinutesState] = useState(
    dateParts ? String(dateParts.minute).padStart(2, "0") : "00",
  );
  const isEditingTime = useRef(false);

  const [currentMonth, setCurrentMonth] = useState<Date>(anchorMonth);

  useEffect(() => {
    if (isEditingTime.current) return;

    if (date) {
      const parsedDate = date instanceof Date ? date : new Date(date);

      if (!isNaN(parsedDate.getTime())) {
        const zonedDate = toZonedCalendarDate(parsedDate, resolvedTimeZone);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHoursState(format(zonedDate, "HH", { locale: dateFnsLocale }));
        setMinutesState(format(zonedDate, "mm", { locale: dateFnsLocale }));
        setCurrentMonth(zonedDate);
      }
    } else if (defaultMonth) {
      setCurrentMonth(toZonedCalendarDate(defaultMonth, resolvedTimeZone));
    }
  }, [date, defaultMonth, dateFnsLocale, resolvedTimeZone]);

  const isTimeOutOfBounds = useMemo(() => {
    if (!date || isNaN(date.getTime())) return false;
    if (minDate && isBefore(date, minDate)) return true;
    if (maxDate && isAfter(date, maxDate)) return true;
    return false;
  }, [date, minDate, maxDate]);

  const displayError = hasError || isTimeOutOfBounds;

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      newDate.setHours(showTime ? Number.parseInt(hours) || 0 : 12);
      newDate.setMinutes(showTime ? Number.parseInt(minutes) || 0 : 0);
      setDate(fromZonedCalendarDate(newDate, resolvedTimeZone));
    }
  };

  const handleTimeChange = (type: "hours" | "minutes", value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    const val = cleanValue.slice(-2);

    const baseDate = date
      ? toZonedCalendarDate(date, resolvedTimeZone)
      : new Date(anchorMonth);

    if (type === "hours") {
      setHoursState(val);
      if (val.length > 0) {
        const h = parseInt(val);
        if (h >= 0 && h < 24) {
          baseDate.setHours(h);
          if (onTimeChange) {
            onTimeChange(
              `${String(baseDate.getHours()).padStart(2, "0")}:${String(baseDate.getMinutes()).padStart(2, "0")}`,
            );
          } else {
            setDate(fromZonedCalendarDate(baseDate, resolvedTimeZone));
          }
        }
      }
    } else {
      setMinutesState(val);
      if (val.length > 0) {
        const m = parseInt(val);
        if (m >= 0 && m < 60) {
          baseDate.setMinutes(m);
          if (onTimeChange) {
            onTimeChange(
              `${String(baseDate.getHours()).padStart(2, "0")}:${String(baseDate.getMinutes()).padStart(2, "0")}`,
            );
          } else {
            setDate(fromZonedCalendarDate(baseDate, resolvedTimeZone));
          }
        }
      }
    }
  };

  const handleBlur = (type: "hours" | "minutes") => {
    const baseDate = date
      ? toZonedCalendarDate(date, resolvedTimeZone)
      : new Date(anchorMonth);
    if (type === "hours") {
      baseDate.setHours(Math.min(Math.max(parseInt(hours) || 0, 0), 23));
    } else {
      baseDate.setMinutes(Math.min(Math.max(parseInt(minutes) || 0, 0), 59));
    }
    let targetDate = fromZonedCalendarDate(baseDate, resolvedTimeZone);

    if (minDate && isBefore(targetDate, minDate))
      targetDate = new Date(minDate);
    if (maxDate && isAfter(targetDate, maxDate)) targetDate = new Date(maxDate);

    const zonedTarget = toZonedCalendarDate(targetDate, resolvedTimeZone);
    setHoursState(format(zonedTarget, "HH", { locale: dateFnsLocale }));
    setMinutesState(format(zonedTarget, "mm", { locale: dateFnsLocale }));
    if (onTimeChange) {
      onTimeChange(
        `${String(zonedTarget.getHours()).padStart(2, "0")}:${String(zonedTarget.getMinutes()).padStart(2, "0")}`,
      );
    } else {
      setDate(targetDate);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          aria-label={ariaLabel}
          aria-invalid={displayError || undefined}
          aria-describedby={ariaDescribedBy}
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-9 px-3",
            !date && "text-muted-foreground",
            displayError &&
              "border-destructive text-destructive focus-visible:ring-destructive",
          )}
        >
          <CalendarIcon
            className={cn(
              "mr-2 opacity-50",
              displayError && "text-destructive opacity-100",
            )}
          />
          {date ? (
            format(calendarDate!, appLocale.dateFormat, {
              locale: dateFnsLocale,
            })
          ) : (
            <span>{placeholder || t("pickDate")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 flex flex-col md:flex-row"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={20}
      >
        <div className="p-3">
          <Calendar
            mode="single"
            selected={calendarDate}
            onSelect={handleDateSelect}
            autoFocus
            disabled={disabled}
            locale={dateFnsLocale}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2035, 11)}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
          />
        </div>
        {showTime && (
          <div className="flex min-w-[120px] flex-col gap-4 border-t border-border bg-muted/20 p-3 md:border-l md:border-t-0">
            <div className="flex items-center gap-2">
              <Clock
                className={cn(
                  "size-4 text-muted-foreground",
                  displayError && "text-destructive",
                )}
              />
              <span
                className={cn(
                  "text-sm font-semibold text-muted-foreground",
                  displayError && "text-destructive",
                )}
              >
                {t("time")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {resolvedTimeZone}
              </span>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-start gap-1">
                <span
                  className={cn(
                    "px-1 text-xs font-medium text-muted-foreground",
                    displayError && "text-destructive",
                  )}
                >
                  {t("hours")}
                </span>
                <Input
                  aria-label={t("hours")}
                  value={hours}
                  onChange={(e) => handleTimeChange("hours", e.target.value)}
                  onBlur={() => {
                    handleBlur("hours");
                    isEditingTime.current = false;
                  }}
                  onFocus={(e) => {
                    isEditingTime.current = true;
                    e.target.select();
                  }}
                  className={cn(
                    "h-8 w-16 bg-background p-0 text-center text-xs focus-visible:ring-1",
                    displayError &&
                      "border-destructive text-destructive focus-visible:ring-destructive",
                  )}
                  inputMode="numeric"
                />
              </div>
              <div className="flex flex-col items-start gap-1">
                <span
                  className={cn(
                    "px-1 text-xs font-medium text-muted-foreground",
                    displayError && "text-destructive",
                  )}
                >
                  {t("minutes")}
                </span>
                <Input
                  aria-label={t("minutes")}
                  value={minutes}
                  onChange={(e) => handleTimeChange("minutes", e.target.value)}
                  onBlur={() => {
                    handleBlur("minutes");
                    isEditingTime.current = false;
                  }}
                  onFocus={(e) => {
                    isEditingTime.current = true;
                    e.target.select();
                  }}
                  className={cn(
                    "h-8 w-16 bg-background p-0 text-center text-xs focus-visible:ring-1",
                    displayError &&
                      "border-destructive text-destructive focus-visible:ring-destructive",
                  )}
                  inputMode="numeric"
                />
              </div>
            </div>
        </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
