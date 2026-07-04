"use client";

import { format, isAfter, isBefore, setHours, setMinutes } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { APPLICATION_LOCALES } from "@/i18n/config";
import { AppLocale, LOCALE_MAP } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

interface DateTimePickerProps {
  date?: Date;
  setDate: (date: Date) => void;
  locale: AppLocale;
  placeholder?: string;
  hasError?: boolean;
  defaultMonth?: Date;
  disabled?: React.ComponentProps<typeof Calendar>["disabled"];
  minDate?: Date;
  maxDate?: Date;
}

export function DateTimePicker({
  date,
  setDate,
  locale,
  placeholder,
  hasError,
  defaultMonth,
  disabled,
  minDate,
  maxDate,
}: DateTimePickerProps) {
  const t = useTranslations("Form");

  const appLocale = APPLICATION_LOCALES[locale];
  const dateFnsLocale = LOCALE_MAP[locale];

  // Safely determine our structural anchor month (Passed default > actual date > fallback today)
  const anchorMonth = defaultMonth || date || new Date();

  const [hours, setHoursState] = useState(
    date ? format(date, "HH", { locale: dateFnsLocale }) : "00",
  );
  const [minutes, setMinutesState] = useState(
    date ? format(date, "mm", { locale: dateFnsLocale }) : "00",
  );

  // Keep track of what month the calendar component is viewing
  const [currentMonth, setCurrentMonth] = useState<Date>(anchorMonth);

  useEffect(() => {
    if (date) {
      const parsedDate = date instanceof Date ? date : new Date(date);

      if (!isNaN(parsedDate.getTime())) {
        setHoursState(format(parsedDate, "HH", { locale: dateFnsLocale }));
        setMinutesState(format(parsedDate, "mm", { locale: dateFnsLocale }));
        setCurrentMonth(parsedDate);
      }
    } else if (defaultMonth) {
      setCurrentMonth(defaultMonth);
    }
  }, [date, defaultMonth, dateFnsLocale]);

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
      newDate.setHours(parseInt(hours) || 0);
      newDate.setMinutes(parseInt(minutes) || 0);
      setDate(newDate);
    }
  };

  const handleTimeChange = (type: "hours" | "minutes", value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    const val = cleanValue.slice(-2);

    // FIXED: Instead of defaulting blindly to today's date (July 2026), fall back to anchorMonth
    const baseDate = date ? new Date(date) : new Date(anchorMonth);

    if (type === "hours") {
      setHoursState(val);
      if (val.length > 0) {
        const h = parseInt(val);
        if (h >= 0 && h < 24) {
          setDate(setHours(baseDate, h));
        }
      }
    } else {
      setMinutesState(val);
      if (val.length > 0) {
        const m = parseInt(val);
        if (m >= 0 && m < 60) {
          setDate(setMinutes(baseDate, m));
        }
      }
    }
  };

  const handleBlur = (type: "hours" | "minutes") => {
    const baseDate = date ? new Date(date) : new Date(anchorMonth);
    let targetDate =
      type === "hours"
        ? setHours(baseDate, Math.min(Math.max(parseInt(hours) || 0, 0), 23))
        : setMinutes(
            baseDate,
            Math.min(Math.max(parseInt(minutes) || 0, 0), 59),
          );

    // One-liner boundary enforcement (Clamping)
    if (minDate && isBefore(targetDate, minDate))
      targetDate = new Date(minDate);
    if (maxDate && isAfter(targetDate, maxDate)) targetDate = new Date(maxDate);

    setHoursState(format(targetDate, "HH", { locale: dateFnsLocale }));
    setMinutesState(format(targetDate, "mm", { locale: dateFnsLocale }));
    setDate(targetDate);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
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
              "mr-2 h-4 w-4 opacity-50",
              displayError && "text-destructive opacity-100",
            )}
          />
          {date ? (
            format(date, appLocale.dateFormat, { locale: dateFnsLocale })
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
            selected={date}
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
        <div className="p-3 flex flex-col md:border-l border-t md:border-t-0 border-border gap-4 bg-muted/20 min-w-[120px]">
          <div className="flex items-center gap-2">
            <Clock
              className={cn(
                "h-4 w-4 text-muted-foreground",
                displayError && "text-destructive",
              )}
            />
            <span
              className={cn(
                "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                displayError && "text-destructive",
              )}
            >
              {t("time")}
            </span>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 items-start">
              <span
                className={cn(
                  "text-[9px] text-muted-foreground uppercase font-medium px-1",
                  displayError && "text-destructive",
                )}
              >
                {t("hours")}
              </span>
              <Input
                value={hours}
                onChange={(e) => handleTimeChange("hours", e.target.value)}
                onBlur={() => handleBlur("hours")}
                onFocus={(e) => e.target.select()}
                className={cn(
                  "w-16 h-8 text-center p-0 text-xs focus-visible:ring-1 bg-background",
                  displayError &&
                    "border-destructive text-destructive focus-visible:ring-destructive",
                )}
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-col gap-1 items-start">
              <span
                className={cn(
                  "text-[9px] text-muted-foreground uppercase font-medium px-1",
                  displayError && "text-destructive",
                )}
              >
                {t("minutes")}
              </span>
              <Input
                value={minutes}
                onChange={(e) => handleTimeChange("minutes", e.target.value)}
                onBlur={() => handleBlur("minutes")}
                onFocus={(e) => e.target.select()}
                className={cn(
                  "w-16 h-8 text-center p-0 text-xs focus-visible:ring-1 bg-background",
                  displayError &&
                    "border-destructive text-destructive focus-visible:ring-destructive",
                )}
                inputMode="numeric"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
