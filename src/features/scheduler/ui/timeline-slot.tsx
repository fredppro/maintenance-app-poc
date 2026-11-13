"use client";

import type { ComponentProps } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toZonedCalendarDate } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import { APPLICATION_LOCALES } from "@/i18n/config";
import { getValidLocale, LOCALE_MAP } from "@/i18n/locale";
import type { ViewMode } from "../types";
import { getTimelineDensity, type getTimelineSlotState } from "../utils/timeline-grid-layout";

type SlotState = ReturnType<typeof getTimelineSlotState>;

export function timelineSlotSurface({ current, weekend }: SlotState) {
  return cn(weekend && "bg-muted/15", current && "bg-primary-muted/10");
}

export function TimelineSlotHeader({
  slot,
  viewMode,
  timeZone,
  state,
  className,
  onClick,
  style,
}: {
  slot: Date;
  viewMode: ViewMode;
  timeZone: string;
  state: SlotState;
  className: string;
  onClick: () => void;
  style?: ComponentProps<typeof Button>["style"];
}) {
  const locale = getValidLocale(useLocale());
  const t = useTranslations("Toolbar");
  const date = toZonedCalendarDate(slot, timeZone);
  const options = { locale: LOCALE_MAP[locale] };
  const dateColumn = viewMode === "week" || viewMode === "month";

  return (
    <Button
      type="button"
      variant="ghost"
      size="row"
      data-slot="timeline-slot-header"
      data-current={state.current}
      data-weekend={state.weekend}
      aria-current={state.current ? viewMode === "day" ? "time" : "date" : undefined}
      aria-label={format(date, viewMode === "day" ? "PPpp" : "PP", options)}
      title={format(date, viewMode === "day" ? "PPpp" : "PP", options)}
      disabled={!dateColumn}
      onClick={onClick}
      style={{ minHeight: getTimelineDensity(viewMode).headerHeight, ...style }}
      className={cn(
        "relative flex-1 flex-col justify-center gap-1 rounded-none border-r border-t-2 border-t-transparent px-1 py-2 text-center font-normal tabular-nums shadow-none focus-visible:z-10 focus-visible:ring-inset disabled:opacity-100 disabled:cursor-default",
        viewMode === "week" && "gap-0.5 py-0.5",
        timelineSlotSurface(state),
        state.current && "border-t-primary bg-primary-muted/50",
        className,
      )}
    >
      {viewMode === "week" ? (
        <>
          <span className={cn(
            "text-xs font-normal uppercase text-muted-foreground",
            state.current && "text-primary-text",
          )}>
            {format(date, "EEE", options)}
          </span>
          <span className={cn(
            "text-sm font-medium",
            state.weekend && "text-muted-foreground",
            state.current && "text-primary-text",
          )}>
            {format(date, "d", options)}
          </span>
          {state.current && (
            <span className="max-w-full truncate rounded-md bg-primary-muted px-1.5 text-xs leading-4 font-medium text-primary-text">
              {t("today")}
            </span>
          )}
        </>
      ) : (
        <span className={cn("max-w-full truncate text-sm text-muted-foreground", state.current && "font-medium text-primary-text")}>
          {format(date, viewMode === "day" ? APPLICATION_LOCALES[locale].timeFormat : viewMode === "month" ? "d" : "MMM", options)}
        </span>
      )}
    </Button>
  );
}

export function TimelineSlotCell({
  state,
  dragOver,
  occupied,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & {
  state: SlotState;
  dragOver: boolean;
  occupied: boolean;
}) {
  return (
    <Button
      {...props}
      type="button"
      variant="ghost"
      size="row"
      data-slot="timeline-slot-cell"
      data-current={state.current}
      data-weekend={state.weekend}
      className={cn(
        "group/cell relative min-h-0 flex-1 cursor-pointer rounded-none border-0 border-r p-0 text-left active:bg-accent focus-visible:z-10 focus-visible:ring-inset",
        timelineSlotSurface(state),
        state.current ? "hover:bg-primary-muted/10" : state.weekend ? "hover:bg-muted/15" : "hover:bg-transparent",
        dragOver && "bg-accent ring-2 ring-inset ring-ring",
        className,
      )}
    >
      {!occupied && <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-2 flex items-center justify-center rounded-lg border-2 border-dashed border-border-strong bg-muted/10 text-muted-foreground opacity-0 transition-opacity duration-150 ease-motion-out group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100 pointer-coarse:opacity-100 pointer-coarse:border-transparent pointer-coarse:bg-transparent group-hover/cell:border-border-strong group-active/cell:border-border-strong group-focus-visible/cell:border-border-strong group-active/cell:bg-muted/10 group-focus-visible/cell:bg-muted/10",
        )}
      >
        <Plus className="size-4 shrink-0" />
      </span>}
    </Button>
  );
}
