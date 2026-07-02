"use client";

import { format, setHours, setMinutes } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppLocale, LOCALE_MAP } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { APPLICATION_LOCALES } from "@/i18n/config";

interface DateTimePickerProps {
  date?: Date;
  setDate: (date: Date) => void;
  locale: AppLocale;
  placeholder?: string;
  hasError?: boolean;
}

export function DateTimePicker({
  date,
  setDate,
  locale,
  placeholder,
  hasError,
}: DateTimePickerProps) {
  const t = useTranslations("Form");

  const appLocale = APPLICATION_LOCALES[locale];
  const dateFnsLocale = LOCALE_MAP[locale];

  const [hours, setHoursState] = useState(
    date ? format(date, "HH", { locale: dateFnsLocale }) : "00",
  );
  const [minutes, setMinutesState] = useState(
    date ? format(date, "mm", { locale: dateFnsLocale }) : "00",
  );

  useEffect(() => {
    if (date) {
      setHoursState(format(date, "HH", { locale: dateFnsLocale }));
      setMinutesState(format(date, "mm", { locale: dateFnsLocale }));
    }
  }, [date, dateFnsLocale]);

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

    // Base date to modify: use current selected date or fallback to today
    const baseDate = date ? new Date(date) : new Date();

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
    const baseDate = date ? new Date(date) : new Date();

    if (type === "hours") {
      const h = parseInt(hours) || 0;
      const clampedH = Math.min(Math.max(h, 0), 23);
      const finalH = clampedH.toString().padStart(2, "0");
      setHoursState(finalH);
      setDate(setHours(baseDate, clampedH));
    } else {
      const m = parseInt(minutes) || 0;
      const clampedM = Math.min(Math.max(m, 0), 59);
      const finalM = clampedM.toString().padStart(2, "0");
      setMinutesState(finalM);
      setDate(setMinutes(baseDate, clampedM));
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-9 px-3",
            !date && "text-muted-foreground",
            hasError &&
              "border-destructive text-destructive focus-visible:ring-destructive",
          )}
        >
          <CalendarIcon
            className={cn(
              "mr-2 h-4 w-4 opacity-50",
              hasError && "text-destructive opacity-100",
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
            initialFocus
            locale={dateFnsLocale}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2035, 11)}
          />
        </div>
        <div className="p-3 flex flex-col md:border-l border-t md:border-t-0 border-border gap-4 bg-muted/20 min-w-[120px]">
          <div className="flex items-center gap-2">
            <Clock
              className={cn(
                "h-4 w-4 text-muted-foreground",
                hasError && "text-destructive",
              )}
            />
            <span
              className={cn(
                "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                hasError && "text-destructive",
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
                  hasError && "text-destructive",
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
                  hasError &&
                    "border-destructive text-destructive focus-visible:ring-destructive",
                )}
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-col gap-1 items-start">
              <span
                className={cn(
                  "text-[9px] text-muted-foreground uppercase font-medium px-1",
                  hasError && "text-destructive",
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
                  hasError &&
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
