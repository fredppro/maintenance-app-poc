"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getValidLocale, LOCALE_MAP } from "src/i18n/locale";
import {
  deleteEquipment as dbDeleteEquipment,
  moveTask as dbMoveTask,
} from "../server/actions";
import { Equipment, MaintenanceEntry } from "../types";
import { useSchedulerStore } from "../store/scheduler-provider";
import { cn } from "@/lib/utils";
import {
  getTimeSlots,
  getTimelineBoundaryClass,
  getTimelineCellMinWidth,
  getTimelineDensity,
  getTimelineColumnWidth,
  getTimelineFitZoom,
  getTimelineSlotState,
  getTimelineTimePosition,
  getTimelineDatePosition,
  getTimelineScrollLeft,
  getViewRange,
  isSameSlot,
  layoutEquipmentRow,
} from "../utils/timeline-grid-layout";
import { format } from "date-fns";
import { toZonedCalendarDate } from "@/lib/time-zone";
import {
  Box,
  CalendarDays,
  Plus,
} from "lucide-react";
import { useLocale, useNow, useTranslations } from "next-intl";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddEntryDialog } from "./add-entry-dialog";
import { EquipmentRowLabel } from "./equipment-row-label";
import { EquipmentDialog } from "./equipment-dialog";
import { MaintenanceEntryBlock } from "./maintenance-entry-block";
import { getTaskDisplayEnd } from "../utils/schedule";
import { searchSchedule } from "../utils/search-schedule";
import { TimelineSlotCell, TimelineSlotHeader, timelineSlotSurface } from "./timeline-slot";
import { resolveTimelineZoom } from "../utils/timeline-zoom";

function layoutWidth(element: HTMLElement) {
  return element.getBoundingClientRect().width || element.clientWidth;
}

export function TimelineGrid({
  searchQuery = "",
}: {
  searchQuery?: string;
}) {
  const locale = getValidLocale(useLocale());
  const dateFnsLocale = LOCALE_MAP[locale];
  const t = useTranslations("Grid");

  const equipment = useSchedulerStore((state) => state.equipment);
  const entries = useSchedulerStore((state) => state.entries);
  const viewMode = useSchedulerStore((state) => state.viewMode);
  const requestedZoom = useSchedulerStore((state) => state.zoomLevel);
  const setFitZoomLevel = useSchedulerStore((state) => state.setFitZoomLevel);
  const currentDate = useSchedulerStore((state) => state.currentDate);
  const timeZone = useSchedulerStore((state) => state.timeZone);
  const isLoading = useSchedulerStore((state) => state.isLoading);
  const setEquipment = useSchedulerStore((state) => state.setEquipment);
  const setEntries = useSchedulerStore((state) => state.setEntries);
  const setViewMode = useSchedulerStore((state) => state.setViewMode);
  const setCurrentDate = useSchedulerStore((state) => state.setCurrentDate);
  const removeEquipment = useSchedulerStore((state) => state.removeEquipment);
  const moveEntry = useSchedulerStore((state) => state.moveEntry);
  const replaceEntry = useSchedulerStore((state) => state.replaceEntry);

  const [draggedEntry, setDraggedEntry] = useState<MaintenanceEntry | null>(
    null,
  );
  const [dragOverCell, setDragOverCell] = useState<{
    date: Date;
    equipmentId: string;
  } | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    date: Date;
    equipmentId: string;
  } | null>(null);

  const [addEquipDialogOpen, setAddEquipDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(
    null,
  );

  const gridRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ width: number; sidebar: number } | null>(null);
  const scrollLayout = useRef<{
    zoom: number;
    date: Date;
    mode: typeof viewMode;
    timeZone: string;
    axisWidth: number;
    width: number;
    sidebar: number;
    header: number;
    left: number;
    top: number;
    rows: { id: string; top: number; height: number }[];
  } | null>(null);
  const positionedRequest = useRef<{
    currentDate: Date;
    viewMode: typeof viewMode;
    timeZone: string;
  } | null>(null);
  const now = useNow({ updateInterval: 60_000 });

  const timeSlots = useMemo(
    () => getTimeSlots(viewMode, currentDate, timeZone),
    [viewMode, currentDate, timeZone],
  );

  const viewRange = useMemo(
    () => getViewRange(timeSlots, viewMode, timeZone),
    [timeSlots, viewMode, timeZone],
  );
  const fitZoom = viewport
    ? getTimelineFitZoom(viewMode, timeSlots.length, viewport.width, viewport.sidebar)
    : null;
  const zoomLevel = resolveTimelineZoom(requestedZoom, fitZoom);
  const columnWidth = viewport
    ? getTimelineColumnWidth(viewMode, timeSlots.length, viewport.width, viewport.sidebar, zoomLevel)
    : undefined;
  const axisStyle = columnWidth === undefined
    ? undefined
    : { width: columnWidth * timeSlots.length, flex: "none" };
  const cellStyle = columnWidth === undefined ? undefined : { minWidth: columnWidth };

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const corner = cornerRef.current;
    if (!grid || !corner) return;
    const measure = () => {
      const width = grid.clientWidth;
      const sidebar = layoutWidth(corner);
      if (width === 0 || sidebar === 0) return;
      setViewport((previous) => previous?.width === width && previous.sidebar === sidebar
        ? previous : { width, sidebar });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(grid);
    observer?.observe(corner);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useLayoutEffect(() => {
    if (fitZoom !== null) setFitZoomLevel(fitZoom);
  }, [fitZoom, setFitZoomLevel]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const axis = axisRef.current;
    const corner = cornerRef.current;
    if (!grid || !axis || !corner || columnWidth === undefined || isLoading) return;
    const previous = scrollLayout.current;
    const gridTop = grid.getBoundingClientRect().top;
    const rows = Array.from(grid.querySelectorAll<HTMLElement>("[data-slot=timeline-equipment-row]"), (row) => ({
      id: row.dataset.equipmentId ?? "",
      top: row.getBoundingClientRect().top - gridTop + grid.scrollTop,
      height: row.getBoundingClientRect().height,
    }));
    const header = corner.parentElement?.getBoundingClientRect().height ?? 0;
    if (
      previous && previous.axisWidth > 0 &&
      previous.date === currentDate && previous.mode === viewMode && previous.timeZone === timeZone &&
      (previous.zoom !== zoomLevel || previous.axisWidth !== layoutWidth(axis) ||
        previous.width !== grid.clientWidth || previous.sidebar !== layoutWidth(corner))
    ) {
      const visibleWidth = Math.min(previous.axisWidth, previous.width - previous.sidebar);
      const anchor = (previous.left + visibleWidth / 2) / previous.axisWidth * 100;
      grid.scrollLeft = getTimelineScrollLeft(anchor, layoutWidth(axis), grid.clientWidth, layoutWidth(corner));
      const visibleTop = previous.top + previous.header;
      const oldRow = previous.rows.find((row) => row.height > 0 && row.top + row.height > visibleTop);
      const newRow = rows.find((row) => row.id === oldRow?.id);
      if (oldRow && newRow) {
        grid.scrollTop = newRow.top + (visibleTop - oldRow.top) / oldRow.height * newRow.height - header;
      }
    }
    scrollLayout.current = {
      zoom: zoomLevel, date: currentDate, mode: viewMode, timeZone,
      axisWidth: layoutWidth(axis), width: grid.clientWidth, sidebar: layoutWidth(corner),
      header, left: grid.scrollLeft, top: grid.scrollTop, rows,
    };
  }, [columnWidth, zoomLevel, currentDate, viewMode, timeZone, isLoading, entries, equipment, searchQuery]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const { equipment: visibleEquipment, entries: visibleEntries } = useMemo(
    () => searchSchedule(entries, equipment, searchQuery),
    [entries, equipment, searchQuery],
  );

  // Read the latest clock/data only on navigation, never on a clock tick or task edit.
  const focusTimeline = useEffectEvent(() => {
    const grid = gridRef.current;
    const axis = axisRef.current;
    const corner = cornerRef.current;
    if (!grid || !axis || !corner || axis.clientWidth === 0) return;
    const previous = positionedRequest.current;
    if (
      previous?.currentDate === currentDate &&
      previous.viewMode === viewMode &&
      previous.timeZone === timeZone
    ) return;

    let target = now;
    let position = getTimelineTimePosition(target, timeSlots, viewRange);
    if (position === null) {
      target = currentDate;
      if (viewMode === "day" && viewRange) {
        const firstTask = visibleEntries
          .filter((entry) => new Date(entry.startTime) <= viewRange.end &&
            getTaskDisplayEnd(entry.startTime, entry.endTime) >= viewRange.start)
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
        if (firstTask) {
          target = new Date(Math.max(viewRange.start.getTime(), new Date(firstTask.startTime).getTime()));
        }
      }
      position = getTimelineTimePosition(target, timeSlots, viewRange);
    }
    if (viewMode !== "day") {
      position = getTimelineDatePosition(target, timeSlots, viewMode, timeZone);
    }
    if (position === null) return;
    grid.scrollLeft = getTimelineScrollLeft(position, layoutWidth(axis), grid.clientWidth, layoutWidth(corner));
    if (scrollLayout.current) scrollLayout.current.left = grid.scrollLeft;
    positionedRequest.current = { currentDate, viewMode, timeZone };
  });

  useEffect(() => {
    if (!isLoading) focusTimeline();
  }, [currentDate, viewMode, timeZone, isLoading]);

  const getEntriesForEquipment = useCallback(
    (equipmentId: string) => {
      if (!viewRange) return [];
      return visibleEntries.filter(
        (entry) =>
          entry.equipmentId === equipmentId &&
          new Date(entry.startTime) <= viewRange.end &&
          getTaskDisplayEnd(entry.startTime, entry.endTime) >= viewRange.start,
      );
    },
    [viewRange, visibleEntries],
  );

  const handleCellClick = (date: Date, equipmentId: string) => {
    setSelectedCell({ date, equipmentId });
    setAddDialogOpen(true);
  };

  const handleHeaderClick = (date: Date) => {
    if (viewMode === "week" || viewMode === "month") {
      setCurrentDate(date);
      setViewMode("day");
    }
  };

  const handleDragStart = (entry: MaintenanceEntry) => {
    setDraggedEntry(entry);
  };

  const handleDragOver = (
    e: React.DragEvent,
    date: Date,
    equipmentId: string,
  ) => {
    e.preventDefault();
    setDragOverCell({ date, equipmentId });
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = async (date: Date, equipmentId: string) => {
    if (draggedEntry) {
      const previousEntries = entries;
      moveEntry(draggedEntry.id, date, equipmentId);

      try {
        const updatedTask = await dbMoveTask(
          draggedEntry.id,
          date,
          equipmentId,
        );
        replaceEntry(draggedEntry.id, updatedTask);
      } catch (error) {
        setEntries(previousEntries);
        console.error("Failed to move task:", error);
        toast.error(t("failedMoveTask"));
      }
    }
    setDraggedEntry(null);
    setDragOverCell(null);
  };

  const handleEditEquip = (equip: Equipment) => {
    setEditingEquipment(equip);
    setAddEquipDialogOpen(true);
  };

  const handleRemoveEquipment = async (id: string) => {
    const previousEquipment = equipment;
    const previousEntries = entries;

    removeEquipment(id);

    try {
      await dbDeleteEquipment(id);
    } catch (error) {
      setEquipment(previousEquipment);
      setEntries(previousEntries);
      console.error("Failed to delete equipment:", error);
      toast.error(t("failedRemoveEquipment"));
    }
  };

  const sections = useSchedulerStore((s) => s.sections);
  const locationLabel = (equip: Equipment) =>
    [
      equip.category,
      sections.find((section) => section.id === equip.sectionId)?.name,
    ]
      .filter(Boolean)
      .join(" · ");

  const getPendingMaintenanceCount = (equipmentId: string) => {
    return visibleEntries.filter(
      (e) => e.equipmentId === equipmentId && e.status !== "completed",
    ).length;
  };

  const equipCategories = useMemo(
    () => [
      ...new Set(equipment.map((e) => e.category).filter(Boolean) as string[]),
    ],
    [equipment],
  );

  const cellWidth = getTimelineCellMinWidth(viewMode);
  const density = getTimelineDensity(viewMode, zoomLevel);
  const yAxisWidth = "w-44 min-w-44 md:w-48 md:min-w-48 xl:w-52 xl:min-w-52";
  const slotStates = timeSlots.map((slot) => getTimelineSlotState(slot, viewMode, now, timeZone));

  const totalTasksInView = useMemo(() => {
    return visibleEquipment.reduce(
      (acc, equip) => acc + getEntriesForEquipment(equip.id).length,
      0,
    );
  }, [getEntriesForEquipment, visibleEquipment]);
  const periodLabel = {
    day: t("periodDay"),
    week: t("periodWeek"),
    month: t("periodMonth"),
    year: t("periodYear"),
  }[viewMode];
  const currentTimePosition = getTimelineTimePosition(now, timeSlots, viewRange);
  const showClock = viewMode === "day" && currentTimePosition !== null;

  return (
    <>
      <div
        ref={gridRef}
        data-slot="timeline-scroll"
        data-view={viewMode}
        data-zoom={zoomLevel}
        onScroll={() => {
          if (scrollLayout.current?.zoom === zoomLevel) {
            scrollLayout.current.left = gridRef.current?.scrollLeft ?? 0;
            scrollLayout.current.top = gridRef.current?.scrollTop ?? 0;
          }
        }}
        aria-busy={isLoading}
        className="@container/timeline relative min-h-0 flex-1 overflow-auto overscroll-contain bg-transparent [scrollbar-gutter:stable]"
      >
        <div className="relative flex h-full min-w-full w-fit flex-col">
          {isLoading && (
            <TimelineGridSkeleton
              boundaryClasses={timeSlots.map((_, index) =>
                getTimelineBoundaryClass(timeSlots, viewMode, index, timeZone),
              )}
              rowCount={Math.min(Math.max(visibleEquipment.length, 3), 6)}
              yAxisWidth={yAxisWidth}
              cellWidth={cellWidth}
              rowHeight={density.minRowHeight}
              headerHeight={density.headerHeight}
              axisStyle={axisStyle}
              cellStyle={cellStyle}
              label={t("loading")}
            />
          )}

          {/* Header row */}
          <div className="sticky top-0 z-20 flex min-w-full w-fit shrink-0 border-b border-border bg-card">
            <div
              ref={cornerRef}
              data-slot="timeline-corner"
              className={cn(
                yAxisWidth,
                "sticky left-0 z-30 flex items-center justify-between border-r border-border bg-card px-6 py-2",
              )}
            >
              <span className="truncate font-semibold text-sm text-foreground">
                {t("equipment")}
              </span>

              <Button
                size="icon-xs"
                variant="ghost"
                className="-mr-2"
                aria-label={t("addEquipment")}
                onClick={() => {
                  setEditingEquipment(null);
                  setAddEquipDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <EquipmentDialog
                open={addEquipDialogOpen}
                onOpenChange={setAddEquipDialogOpen}
                equipment={editingEquipment}
                categories={equipCategories}
              />
            </div>
            <div
              ref={axisRef}
              data-slot="timeline-axis"
              className="relative flex flex-1"
              style={axisStyle}
            >
              {timeSlots.map((slot, idx) => (
                <TimelineSlotHeader
                  key={idx}
                  onClick={() => handleHeaderClick(slot)}
                  slot={slot}
                  viewMode={viewMode}
                  timeZone={timeZone}
                  state={slotStates[idx]}
                  className={cn(
                    cellWidth,
                    getTimelineBoundaryClass(timeSlots, viewMode, idx, timeZone),
                  )}
                  style={cellStyle}
                />
              ))}
            </div>
          </div>

          {/* Equipment rows */}
          <div className="flex min-w-full w-fit flex-1 flex-col">
            {visibleEquipment.length > 0 ? (
              visibleEquipment.map((equip) => {
                const equipEntries = getEntriesForEquipment(equip.id);
                const pendingCount = getPendingMaintenanceCount(equip.id);

                const { items: processedEntries, trackCount, height: rowHeight } =
                  layoutEquipmentRow(
                    equipEntries,
                    timeSlots,
                    viewRange,
                    viewMode,
                    timeZone,
                    zoomLevel,
                  );

                return (
                  <div
                    key={equip.id}
                    data-slot="timeline-equipment-row"
                    data-equipment-id={equip.id}
                    className="flex min-w-full w-fit border-b border-border"
                  >
                    <EquipmentRowLabel
                      equipment={equip}
                      className={yAxisWidth}
                      locationLabel={locationLabel(equip)}
                      pendingCount={pendingCount}
                      onEdit={() => handleEditEquip(equip)}
                      onRemove={() => handleRemoveEquipment(equip.id)}
                    />

                    {/* Timeline cells */}
                    <div className="relative isolate flex flex-1 overflow-hidden" style={axisStyle}>
                      {timeSlots.map((slot, slotIdx) => {
                        const isDragOver =
                          dragOverCell &&
                          dragOverCell.equipmentId === equip.id &&
                          isSameSlot(dragOverCell.date, slot, viewMode, timeZone);

                        return (
                          <TimelineSlotCell
                            state={slotStates[slotIdx]}
                            dragOver={Boolean(isDragOver)}
                            occupied={processedEntries.some(({ startIdx, endIdx }) =>
                              slotIdx >= startIdx && slotIdx < endIdx)}
                            aria-label={t("addEntryAt", {
                              equipment: equip.name,
                              date: format(
                                toZonedCalendarDate(slot, timeZone),
                                viewMode === "day" ? "PPpp" : "PP",
                                { locale: dateFnsLocale },
                              ),
                            })}
                            title={t("addEntryAt", {
                              equipment: equip.name,
                              date: format(
                                toZonedCalendarDate(slot, timeZone),
                                viewMode === "day" ? "PPpp" : "PP",
                                { locale: dateFnsLocale },
                              ),
                            })}
                            key={slotIdx}
                            className={cn(
                              cellWidth,
                              getTimelineBoundaryClass(
                                timeSlots,
                                viewMode,
                                slotIdx,
                                timeZone,
                              ),
                            )}
                            style={{ ...cellStyle, height: `${rowHeight}px` }}
                            onClick={() => handleCellClick(slot, equip.id)}
                            onDragOver={(e) =>
                              handleDragOver(e, slot, equip.id)
                            }
                            onDragLeave={handleDragLeave}
                            onDrop={() => handleDrop(slot, equip.id)}
                          />
                        );
                      })}

                      {/* Render entries as overlay */}
                      {!isLoading &&
                        processedEntries.map(
                          ({ entry, startIdx, effectiveSpan, track }) => {
                            const totalSlots = timeSlots.length;
                            const startPercent = (startIdx / totalSlots) * 100;
                            const widthPercent =
                              (effectiveSpan / totalSlots) * 100;
                            return (
                              <MaintenanceEntryBlock
                                key={entry.id}
                                entry={entry}
                                viewMode={viewMode}
                                timeZone={timeZone}
                                style={{
                                  position: "absolute",
                                  left: `calc(${startPercent}% + ${density.columnInset}px)`,
                                  width: `calc(${widthPercent}% - ${density.columnInset * 2}px)`,
                                  top: density.padding + track * density.trackHeight,
                                  height: viewMode !== "week" && trackCount === 1
                                    ? rowHeight - density.padding * 2
                                    : density.entryHeight,
                                }}
                                onDragStart={() => handleDragStart(entry)}
                                isDragging={draggedEntry?.id === entry.id}
                              />
                            );
                          },
                        )}
                      {showClock && (
                        <div
                          data-slot="timeline-now-line"
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 z-10 border-l border-primary"
                          style={{ left: `${currentTimePosition}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex min-h-64 min-w-full w-fit border-b border-border">
                <div
                  className={cn(
                    yAxisWidth,
                    "sticky left-0 z-10 flex overflow-hidden border-r border-border bg-card",
                  )}
                >
                  <Empty className="min-h-0 min-w-0 flex-1 gap-3 rounded-none border-0 p-6 md:p-6">
                    <EmptyHeader className="gap-1">
                      <EmptyMedia variant="icon">
                        <Box aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle className="text-xs">
                        {normalizedSearch
                          ? t("noSearchResults")
                          : t("noEquipment")}
                      </EmptyTitle>
                    </EmptyHeader>
                    {!normalizedSearch && (
                      <EmptyContent>
                        <Button
                          variant="outline"
                          size="row"
                          className="w-full justify-center text-center"
                          onClick={() => {
                            setEditingEquipment(null);
                            setAddEquipDialogOpen(true);
                          }}
                        >
                          {t("addEquipment")}
                        </Button>
                      </EmptyContent>
                    )}
                  </Empty>
                </div>
                <div className="flex min-h-64 flex-1" aria-hidden="true">
                  {timeSlots.map((slot, index) => (
                    <div
                      key={index}
                      className={cn(
                        cellWidth,
                        "flex-1 border-r",
                        getTimelineBoundaryClass(timeSlots, viewMode, index, timeZone),
                        timelineSlotSurface(slotStates[index]),
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
            {visibleEquipment.length > 0 && !isLoading && totalTasksInView === 0 && (
              <div
                data-slot="timeline-feedback"
                className="sticky left-0 flex w-[100cqw] shrink-0 justify-center py-6"
              >
                <Empty
                  role="status"
                  aria-live="polite"
                  size="sm"
                  className="min-h-0 min-w-0 w-full flex-none gap-2 border-0"
                >
                  <EmptyHeader className="gap-1">
                    <EmptyMedia variant="icon" className="mb-0 size-8">
                      <CalendarDays aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm">
                      {normalizedSearch
                        ? t("noSearchResults")
                        : t("noTasksInPeriod", { period: periodLabel })}
                    </EmptyTitle>
                    <EmptyDescription className="text-xs">
                      {normalizedSearch
                        ? t("clearSearchHint")
                        : t("emptyPeriodHint")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddEntryDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        selectedCell={selectedCell}
      />
    </>
  );
}

function TimelineGridSkeleton({
  boundaryClasses,
  rowCount,
  yAxisWidth,
  cellWidth,
  label,
  rowHeight,
  headerHeight,
  axisStyle,
  cellStyle,
}: {
  boundaryClasses: string[];
  rowCount: number;
  yAxisWidth: string;
  cellWidth: string;
  label: string;
  rowHeight: number;
  headerHeight: number;
  axisStyle?: React.CSSProperties;
  cellStyle?: React.CSSProperties;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="pointer-events-auto absolute inset-0 z-40 bg-card"
    >
      <div
        aria-hidden="true"
        className="flex h-full min-w-full w-fit flex-col"
      >
        <div data-slot="timeline-skeleton-header" className="sticky top-0 z-20 flex min-w-full flex-none border-b border-border bg-card">
          <div
            className={cn(
              yAxisWidth,
              "sticky left-0 z-10 flex items-center border-r border-border bg-card px-2",
            )}
            style={{ height: headerHeight }}
          >
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-1" style={axisStyle}>
            {boundaryClasses.map((boundaryClass, index) => (
              <div
                key={index}
                className={cn(
                  cellWidth,
                  "flex flex-1 items-center justify-center border-r p-1",
                  boundaryClass,
                )}
                style={cellStyle}
              >
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
        {Array.from({ length: rowCount }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex min-w-full flex-none border-b border-border"
            style={{ height: rowHeight }}
          >
            <div
              className={cn(
                yAxisWidth,
                "sticky left-0 z-10 flex items-center gap-2 border-r border-border bg-card px-2",
              )}
            >
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="relative flex flex-1" style={axisStyle}>
              {boundaryClasses.map((boundaryClass, index) => (
                <div
                  key={index}
                  className={cn(
                    cellWidth,
                    "flex-1 border-r",
                    boundaryClass,
                  )}
                  style={cellStyle}
                />
              ))}
              <Skeleton
                className={cn(
                  "absolute top-3 h-8",
                  rowIndex % 2 === 0
                    ? "left-[12%] w-[28%]"
                    : "left-[38%] w-[34%]",
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
