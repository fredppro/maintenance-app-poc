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
import { APPLICATION_LOCALES } from "src/i18n/config";
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
  getViewRange,
  isSameSlot,
  layoutEquipmentRow,
} from "../utils/timeline-grid-layout";
import { format, isSameDay } from "date-fns";
import {
  Box,
  CalendarDays,
  Plus,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddEntryDialog } from "./add-entry-dialog";
import { EquipmentRowLabel } from "./equipment-row-label";
import { EquipmentDialog } from "./equipment-dialog";
import { MaintenanceEntryBlock } from "./maintenance-entry-block";

export function TimelineGrid() {
  const locale = getValidLocale(useLocale());
  const dateFnsLocale = LOCALE_MAP[locale];
  const config = APPLICATION_LOCALES[locale];
  const t = useTranslations("Grid");

  const equipment = useSchedulerStore((state) => state.equipment);
  const entries = useSchedulerStore((state) => state.entries);
  const viewMode = useSchedulerStore((state) => state.viewMode);
  const currentDate = useSchedulerStore((state) => state.currentDate);
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

  const timeSlots = useMemo(
    () => getTimeSlots(viewMode, currentDate),
    [viewMode, currentDate],
  );

  const formatHeader = (date: Date): string => {
    switch (viewMode) {
      case "day":
        return format(date, config.timeFormat, { locale: dateFnsLocale });
      case "week":
        return format(date, "EEE d", { locale: dateFnsLocale });
      case "month":
        return format(date, "d", { locale: dateFnsLocale });
      case "year":
        return format(date, "MMM", { locale: dateFnsLocale });
    }
  };

  const viewRange = useMemo(
    () => getViewRange(timeSlots, viewMode),
    [timeSlots, viewMode],
  );

  const getEntriesForEquipment = useCallback(
    (equipmentId: string) => {
      if (!viewRange) return [];
      return entries.filter(
        (entry) =>
          entry.equipmentId === equipmentId &&
          new Date(entry.startTime) <= viewRange.end &&
          new Date(entry.endTime) >= viewRange.start,
      );
    },
    [entries, viewRange],
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
      const duration =
        draggedEntry.endTime.getTime() - draggedEntry.startTime.getTime();
      const newEndTime = new Date(date.getTime() + duration);

      moveEntry(draggedEntry.id, date, equipmentId);

      try {
        const updatedTask = await dbMoveTask(
          draggedEntry.id,
          date,
          newEndTime,
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

  const isToday = (date: Date) => isSameSlot(date, new Date(), viewMode);

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
    return entries.filter(
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
  const yAxisWidth =
    "w-44 min-w-44 md:w-48 md:min-w-48 xl:w-52 xl:min-w-52";

  const totalTasksInView = useMemo(() => {
    return equipment.reduce(
      (acc, equip) => acc + getEntriesForEquipment(equip.id).length,
      0,
    );
  }, [equipment, getEntriesForEquipment]);
  const periodLabel = {
    day: t("periodDay"),
    week: t("periodWeek"),
    month: t("periodMonth"),
    year: t("periodYear"),
  }[viewMode];
  const now = new Date();
  const currentTimePosition =
    ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;

  return (
    <>
      <div
        ref={gridRef}
        aria-busy={isLoading}
        className="relative flex-1 overflow-auto rounded-lg border border-border bg-card"
      >
        <div className="relative flex h-full min-w-full w-fit flex-col">
          {isLoading && (
            <TimelineGridSkeleton
              boundaryClasses={timeSlots.map((_, index) =>
                getTimelineBoundaryClass(timeSlots, viewMode, index),
              )}
              rowCount={Math.min(Math.max(equipment.length, 3), 6)}
              yAxisWidth={yAxisWidth}
              cellWidth={cellWidth}
              label={t("loading")}
            />
          )}

          {/* Header row */}
          <div className="sticky top-0 z-20 flex min-w-full w-fit shrink-0 border-b border-border bg-card">
            <div
              className={cn(
                yAxisWidth,
                "sticky left-0 z-30 flex items-center justify-between border-r border-border bg-card px-2 py-2",
              )}
            >
              <span className="font-semibold text-sm text-foreground">
                {t("equipment")}
              </span>

              <Button
                size="icon"
                variant="ghost"
                className="size-8"
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
            <div className="flex flex-1">
              {timeSlots.map((slot, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => handleHeaderClick(slot)}
                  disabled={viewMode !== "week" && viewMode !== "month"}
                  aria-label={format(
                    slot,
                    viewMode === "day" ? "PPpp" : "PP",
                    { locale: dateFnsLocale },
                  )}
                  aria-current={
                    isToday(slot) && viewMode !== "day" ? "date" : undefined
                  }
                  className={cn(
                    cellWidth,
                    "relative flex-1 whitespace-nowrap border-b-0 border-r px-1 py-2 text-center tabular-nums text-xs font-medium text-muted-foreground transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default sm:text-sm",
                    getTimelineBoundaryClass(timeSlots, viewMode, idx),
                    (viewMode === "week" || viewMode === "month") &&
                      "cursor-pointer hover:bg-accent hover:text-foreground active:bg-accent/80",
                    isToday(slot) &&
                      "bg-primary-muted/50 text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
                  )}
                >
                  {formatHeader(slot)}
                </button>
              ))}
            </div>
          </div>

          {/* Equipment rows */}
          <div className="flex min-w-full w-fit flex-1 flex-col">
            {equipment.length > 0 ? (
              equipment.map((equip) => {
                const equipEntries = getEntriesForEquipment(equip.id);
                const pendingCount = getPendingMaintenanceCount(equip.id);

                const { items: processedEntries, trackCount, height: rowHeight } =
                  layoutEquipmentRow(
                    equipEntries,
                    timeSlots,
                    viewRange,
                    viewMode,
                  );

                return (
                  <div
                    key={equip.id}
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
                    <div className="relative isolate flex flex-1 overflow-hidden">
                      {timeSlots.map((slot, slotIdx) => {
                        const isDragOver =
                          dragOverCell &&
                          dragOverCell.equipmentId === equip.id &&
                          isSameSlot(dragOverCell.date, slot, viewMode);

                        return (
                          <button
                            type="button"
                            aria-label={t("addEntryAt", {
                              equipment: equip.name,
                              date: format(
                                slot,
                                viewMode === "day" ? "PPpp" : "PP",
                                { locale: dateFnsLocale },
                              ),
                            })}
                            title={t("addEntryAt", {
                              equipment: equip.name,
                              date: format(
                                slot,
                                viewMode === "day" ? "PPpp" : "PP",
                                { locale: dateFnsLocale },
                              ),
                            })}
                            key={slotIdx}
                            className={cn(
                              cellWidth,
                              "group/cell relative flex-1 cursor-pointer rounded-none border-0 border-r bg-transparent p-0 text-left transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                              getTimelineBoundaryClass(
                                timeSlots,
                                viewMode,
                                slotIdx,
                              ),
                              "hover:bg-accent/50 active:bg-accent/80",
                              isDragOver && "bg-primary-muted",
                              isToday(slot) &&
                                !processedEntries.some(
                                  ({ startIdx, effectiveSpan }) =>
                                    slotIdx >= startIdx &&
                                    slotIdx < startIdx + effectiveSpan,
                                ) &&
                                "bg-primary-muted/30",
                            )}
                            style={{ height: `${rowHeight}px` }}
                            onClick={() => handleCellClick(slot, equip.id)}
                            onDragOver={(e) =>
                              handleDragOver(e, slot, equip.id)
                            }
                            onDragLeave={handleDragLeave}
                            onDrop={() => handleDrop(slot, equip.id)}
                          >
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute left-1/2 top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-background text-primary opacity-0 shadow-sm ring-1 ring-border transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100"
                            >
                              <Plus className="size-4" />
                            </span>
                          </button>
                        );
                      })}

                      {viewMode === "day" &&
                        isSameDay(currentDate, now) && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-0 border-l border-primary"
                            style={{
                              left: `${currentTimePosition}%`,
                            }}
                          >
                            <span className="absolute -left-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-card" />
                          </div>
                        )}

                      {/* Render entries as overlay */}
                      {!isLoading &&
                        processedEntries.map(
                          ({ entry, startIdx, effectiveSpan, track }) => {
                            const totalSlots = timeSlots.length;
                            const startPercent = (startIdx / totalSlots) * 100;
                            const widthPercent =
                              (effectiveSpan / totalSlots) * 100;
                            const stacked =
                              trackCount > 1 &&
                              processedEntries.some(
                                (other) =>
                                  other.entry.id !== entry.id &&
                                  Math.max(startIdx, other.startIdx) <
                                    Math.min(
                                      startIdx + effectiveSpan,
                                      other.startIdx + other.effectiveSpan,
                                    ),
                              );

                            return (
                              <MaintenanceEntryBlock
                                key={entry.id}
                                entry={entry}
                                timeSlotsCount={timeSlots.length}
                                style={{
                                  position: "absolute",
                                  left: `calc(${startPercent}% + 2px)`,
                                  width: `calc(${widthPercent}% - 4px)`,
                                  top: stacked
                                    ? `calc(4px + ${track} * ((100% - 4px) / ${trackCount}))`
                                    : "4px",
                                  height: stacked
                                    ? `calc((100% - 4px) / ${trackCount} - 4px)`
                                    : "calc(100% - 8px)",
                                }}
                                onDragStart={() => handleDragStart(entry)}
                                isDragging={draggedEntry?.id === entry.id}
                              />
                            );
                          },
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
                    "sticky left-0 z-10 border-r border-border bg-card",
                  )}
                  aria-hidden="true"
                />
                <div className="relative flex min-h-64 flex-1">
                  {timeSlots.map((slot, index) => (
                    <div
                      key={index}
                      aria-hidden="true"
                      className={cn(
                        cellWidth,
                        "flex-1 border-r",
                        getTimelineBoundaryClass(timeSlots, viewMode, index),
                      )}
                    />
                  ))}
                  <Empty className="absolute inset-0 min-h-0 flex-none gap-3 rounded-none border-0 bg-background/85 p-4">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Box aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm">
                        {t("noEquipment")}
                      </EmptyTitle>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        variant="outline"
                        onClick={() => setAddEquipDialogOpen(true)}
                      >
                        <Plus data-icon="inline-start" />
                        {t("addEquipment")}
                      </Button>
                    </EmptyContent>
                  </Empty>
                </div>
              </div>
            )}
            {equipment.length > 0 && !isLoading && totalTasksInView === 0 && (
              <div className="flex flex-1 justify-center py-10 pl-44 md:pl-48 xl:pl-52">
                <Empty
                  role="status"
                  aria-live="polite"
                  className="min-h-0 flex-none gap-2 border-0 p-4"
                >
                  <EmptyHeader className="gap-1">
                    <EmptyMedia variant="icon" className="mb-0 size-8">
                      <CalendarDays aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm">
                      {t("noTasksInPeriod", { period: periodLabel })}
                    </EmptyTitle>
                    <EmptyDescription className="text-xs">
                      {t("emptyPeriodHint")}
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
}: {
  boundaryClasses: string[];
  rowCount: number;
  yAxisWidth: string;
  cellWidth: string;
  label: string;
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
        <div className="sticky top-0 z-20 flex min-w-full flex-none border-b border-border bg-card">
          <div
            className={cn(
              yAxisWidth,
              "sticky left-0 z-10 flex h-12 items-center border-r border-border bg-card px-2",
            )}
          >
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-1">
            {boundaryClasses.map((boundaryClass, index) => (
              <div
                key={index}
                className={cn(
                  cellWidth,
                  "flex flex-1 items-center justify-center border-r p-1",
                  boundaryClass,
                )}
              >
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
        {Array.from({ length: rowCount }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex h-14 min-w-full flex-none border-b border-border"
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
            <div className="relative flex flex-1">
              {boundaryClasses.map((boundaryClass, index) => (
                <div
                  key={index}
                  className={cn(
                    cellWidth,
                    "flex-1 border-r",
                    boundaryClass,
                  )}
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
