"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getValidLocale, LOCALE_MAP } from "src/i18n/locale";
import { useSchedulerStore } from "../store/scheduler-provider";
import { ViewMode } from "../types";
import { format } from "date-fns";
import { toZonedCalendarDate } from "@/lib/time-zone";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { getTimelineMinimumZoom, resolveTimelineZoom, stepTimelineZoom, TIMELINE_ZOOM_LEVELS, TIMELINE_ZOOM_TOLERANCE } from "../utils/timeline-zoom";

const viewModeOrder: ViewMode[] = ["day", "week", "month", "year"];

export function SchedulerToolbar() {
  const locale = getValidLocale(useLocale());
  const dateFnsLocale = LOCALE_MAP[locale];

  const t = useTranslations("Toolbar");
  const formatter = useFormatter();

  const viewMode = useSchedulerStore((state) => state.viewMode);
  const zoomLevel = useSchedulerStore((state) => state.zoomLevel);
  const fitZoomLevel = useSchedulerStore((state) => state.fitZoomLevel);
  const setZoomLevel = useSchedulerStore((state) => state.setZoomLevel);
  const currentDate = useSchedulerStore((state) => state.currentDate);
  const timeZone = useSchedulerStore((state) => state.timeZone);
  const setViewMode = useSchedulerStore((state) => state.setViewMode);
  const setCurrentDate = useSchedulerStore((state) => state.setCurrentDate);
  const navigateForward = useSchedulerStore((state) => state.navigateForward);
  const navigateBackward = useSchedulerStore((state) => state.navigateBackward);

  const formatDateRange = () => {
    const zonedDate = toZonedCalendarDate(currentDate, timeZone);
    switch (viewMode) {
      case "day":
        return format(zonedDate, "EEEE, MMMM d, yyyy", {
          locale: dateFnsLocale,
        });
      case "week":
        const formattedDateToken = format(zonedDate, "MMMM d, yyyy", {
          locale: dateFnsLocale,
        });
        return t("weekRange", { date: formattedDateToken });
      case "month":
        return format(zonedDate, "MMMM yyyy", { locale: dateFnsLocale });
      case "year":
        return format(zonedDate, "yyyy", { locale: dateFnsLocale });
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(stepTimelineZoom(zoomLevel, 1, fitZoomLevel));
  };

  const handleZoomOut = () => {
    setZoomLevel(stepTimelineZoom(zoomLevel, -1, fitZoomLevel));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const zoomPercent = resolveTimelineZoom(zoomLevel, fitZoomLevel);
  const atFit = fitZoomLevel !== null && Math.abs(zoomPercent - fitZoomLevel) <= TIMELINE_ZOOM_TOLERANCE;
  const zoomLabel = formatter.number(zoomPercent / 100, { style: "percent", maximumFractionDigits: atFit ? 1 : 0 });
  const fitDescription = t("fitWidthDescription", { zoom: zoomLabel });
  const canZoomIn = fitZoomLevel !== null && zoomPercent < TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1];
  const canZoomOut = fitZoomLevel !== null && zoomPercent > getTimelineMinimumZoom(fitZoomLevel) + TIMELINE_ZOOM_TOLERANCE;

  return (
    <TooltipProvider>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <ButtonGroup aria-label={t("navigation")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("previous")}
                  onClick={navigateBackward}
                >
                  <ChevronLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("previous")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t("today")}
                  onClick={handleToday}
                >
                  {t("today")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("today")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("next")}
                  onClick={navigateForward}
                >
                  <ChevronRight />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("next")}</TooltipContent>
            </Tooltip>
          </ButtonGroup>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Calendar className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-medium text-foreground" aria-live="polite">
              {formatDateRange()}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-3 xl:w-auto">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={viewMode}
            aria-label={t("viewSelector")}
            className="flex flex-1 sm:flex-none"
            onValueChange={(value) => {
              const selectedMode = viewModeOrder.find((mode) => mode === value);
              if (selectedMode) setViewMode(selectedMode);
            }}
          >
            {viewModeOrder.map((mode) => (
              <ToggleGroupItem
                key={mode}
                value={mode}
                className="flex-1 px-2 text-sm sm:flex-none sm:px-3"
              >
                {t(mode)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <ButtonGroup aria-label={t("zoom")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("zoomOut")}
                  onClick={handleZoomOut}
                  disabled={!canZoomOut}
                >
                  <Minus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("zoomOut")}</TooltipContent>
            </Tooltip>

            <ButtonGroupText className="w-16 justify-center px-2 tabular-nums" aria-live="polite" aria-atomic="true" title={atFit ? fitDescription : zoomLabel}>
              {atFit ? (
                <>
                  <span aria-hidden="true">{t("fitWidth")}</span>
                  <span className="sr-only">{fitDescription}</span>
                </>
              ) : zoomLabel}
            </ButtonGroupText>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("zoomIn")}
                  onClick={handleZoomIn}
                  disabled={!canZoomIn}
                >
                  <Plus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("zoomIn")}</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </div>
      </div>
    </TooltipProvider>
  );
}
