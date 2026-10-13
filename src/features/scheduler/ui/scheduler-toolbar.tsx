"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

const viewModeOrder: ViewMode[] = ["day", "week", "month", "year"];

export function SchedulerToolbar() {
  const locale = getValidLocale(useLocale());
  const dateFnsLocale = LOCALE_MAP[locale];

  const t = useTranslations("Toolbar");

  const viewMode = useSchedulerStore((state) => state.viewMode);
  const currentDate = useSchedulerStore((state) => state.currentDate);
  const setViewMode = useSchedulerStore((state) => state.setViewMode);
  const setCurrentDate = useSchedulerStore((state) => state.setCurrentDate);
  const navigateForward = useSchedulerStore((state) => state.navigateForward);
  const navigateBackward = useSchedulerStore((state) => state.navigateBackward);

  const formatDateRange = () => {
    switch (viewMode) {
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy", {
          locale: dateFnsLocale,
        });
      case "week":
        const formattedDateToken = format(currentDate, "MMMM d, yyyy", {
          locale: dateFnsLocale,
        });
        return t("weekRange", { date: formattedDateToken });
      case "month":
        return format(currentDate, "MMMM yyyy", { locale: dateFnsLocale });
      case "year":
        return format(currentDate, "yyyy", { locale: dateFnsLocale });
    }
  };

  const handleZoomIn = () => {
    const currentIndex = viewModeOrder.indexOf(viewMode);
    if (currentIndex > 0) {
      setViewMode(viewModeOrder[currentIndex - 1]);
    }
  };

  const handleZoomOut = () => {
    const currentIndex = viewModeOrder.indexOf(viewMode);
    if (currentIndex < viewModeOrder.length - 1) {
      setViewMode(viewModeOrder[currentIndex + 1]);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const canZoomIn = viewModeOrder.indexOf(viewMode) > 0;
  const canZoomOut = viewModeOrder.indexOf(viewMode) < viewModeOrder.length - 1;

  return (
    <TooltipProvider>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-card p-2 sm:gap-3 sm:p-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* Left side: Navigation */}
        <div className="flex min-w-0 items-center gap-2">
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("previous")}
                  onClick={navigateBackward}
                >
                  <ChevronLeft  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("previous")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("today")}
                  onClick={handleToday}
                >
                  <RotateCcw  />
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
                  <ChevronRight  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("next")}</TooltipContent>
            </Tooltip>
          </ButtonGroup>

          <div className="flex min-w-0 items-center gap-2 px-1">
            <Calendar className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-medium text-foreground">
              {formatDateRange()}
            </span>
          </div>
        </div>

        {/* Center: View Mode Buttons */}
        <ButtonGroup className="col-span-2 row-start-2 w-full lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:w-fit lg:justify-self-center" aria-label={t("viewSelector")}>
          {viewModeOrder.map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? "default" : "outline"}
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className="h-9 flex-1 px-2 text-sm capitalize pointer-coarse:h-10 lg:flex-none lg:px-3"
            >
              {t(mode)}
            </Button>
          ))}
        </ButtonGroup>

        {/* Right side: Zoom Controls */}
        <div className="col-start-2 row-start-1 flex items-center gap-2 lg:col-start-3 lg:justify-self-end">
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("zoomIn")}
                  onClick={handleZoomIn}
                  disabled={!canZoomIn}
                >
                  <ZoomIn  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("zoomIn")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("zoomOut")}
                  onClick={handleZoomOut}
                  disabled={!canZoomOut}
                >
                  <ZoomOut  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("zoomOut")}</TooltipContent>
            </Tooltip>
          </ButtonGroup>
        </div>
      </div>
    </TooltipProvider>
  );
}
