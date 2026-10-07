"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { APPLICATION_LOCALES } from "src/i18n/config";
import { getValidLocale, LOCALE_MAP } from "src/i18n/locale";
import {
  addEquipment as dbAddEquipment,
  deleteEquipment as dbDeleteEquipment,
  moveTask as dbMoveTask,
  updateEquipment as dbUpdateEquipment,
} from "../server/actions";
import { Equipment, MaintenanceEntry } from "../types";
import { useSchedulerStore } from "../store/scheduler-provider";
import { cn } from "@/lib/utils";
import {
  getTimelineBoundaryClass,
  getTimelineCellMinWidth,
} from "../utils/timeline-grid-layout";
import {
  addHours,
  differenceInDays,
  eachDayOfInterval,
  eachHourOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameHour,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import {
  Box,
  CalendarDays,
  MoreVertical,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddEntryDialog } from "./add-entry-dialog";
import { EquipmentDialog } from "./equipment-dialog";
import { MaintenanceEntryBlock } from "./maintenance-entry-block";

export function TimelineGrid() {
  const locale = getValidLocale(useLocale());
  const dateFnsLocale = LOCALE_MAP[locale];
  const config = APPLICATION_LOCALES[locale];
  const t = useTranslations("Grid");
  const tCommon = useTranslations("Common");

  const equipment = useSchedulerStore((state) => state.equipment);
  const entries = useSchedulerStore((state) => state.entries);
  const viewMode = useSchedulerStore((state) => state.viewMode);
  const currentDate = useSchedulerStore((state) => state.currentDate);
  const isLoading = useSchedulerStore((state) => state.isLoading);
  const setEquipment = useSchedulerStore((state) => state.setEquipment);
  const setEntries = useSchedulerStore((state) => state.setEntries);
  const setViewMode = useSchedulerStore((state) => state.setViewMode);
  const setCurrentDate = useSchedulerStore((state) => state.setCurrentDate);
  const addEquipment = useSchedulerStore((state) => state.addEquipment);
  const updateEquipment = useSchedulerStore((state) => state.updateEquipment);
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

  const timeSlots = useMemo(() => {
    switch (viewMode) {
      case "day": {
        const dayStart = startOfDay(currentDate);
        return eachHourOfInterval({
          start: dayStart,
          end: addHours(dayStart, 23),
        });
      }
      case "week": {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return eachDayOfInterval({ start: weekStart, end: weekEnd });
      }
      case "month": {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return eachDayOfInterval({ start: monthStart, end: monthEnd });
      }
      case "year": {
        const yearStart = startOfYear(currentDate);
        return eachMonthOfInterval({
          start: yearStart,
          end: new Date(currentDate.getFullYear(), 11, 31),
        });
      }
      default:
        return [];
    }
  }, [viewMode, currentDate]);

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
      default:
        return "";
    }
  };

  const viewRange = useMemo(() => {
    if (timeSlots.length === 0) return null;
    return {
      start: timeSlots[0],
      end:
        viewMode === "day"
          ? endOfDay(timeSlots[timeSlots.length - 1])
          : viewMode === "year"
            ? endOfMonth(timeSlots[timeSlots.length - 1])
            : endOfDay(timeSlots[timeSlots.length - 1]),
    };
  }, [timeSlots, viewMode]);

  const getEntriesForEquipment = useCallback(
    (equipmentId: string) => {
      if (!viewRange) return [];

      return entries.filter((entry) => {
        if (entry.equipmentId !== equipmentId) return false;

        const entryStart = new Date(entry.startTime);
        const entryEnd = new Date(entry.endTime);

        // Overlap check: (StartA <= EndB) and (EndA >= StartB)
        return entryStart <= viewRange.end && entryEnd >= viewRange.start;
      });
    },
    [entries, viewRange],
  );

  const getEntryStartSlotIndex = (entry: MaintenanceEntry): number => {
    const entryStart = new Date(entry.startTime);

    // Find the first slot that contains or starts after the entry start
    let lastIndex = -1;
    for (let i = 0; i < timeSlots.length; i++) {
      const slot = timeSlots[i];
      let isMatch = false;

      switch (viewMode) {
        case "day":
          isMatch = isSameHour(entryStart, slot) || entryStart > slot;
          break;
        case "week":
        case "month":
          isMatch = isSameDay(entryStart, slot) || entryStart > slot;
          break;
        case "year":
          isMatch = isSameMonth(entryStart, slot) || entryStart > slot;
          break;
      }

      if (isMatch) {
        lastIndex = i;
      } else {
        break;
      }
    }

    if (lastIndex === -1 && entryStart < timeSlots[0]) return 0;
    return lastIndex;
  };

  const getEntrySpan = (entry: MaintenanceEntry): number => {
    const entryStart = new Date(entry.startTime);
    const entryEnd = new Date(entry.endTime);

    // Clamp start/end to view range for span calculation
    const effectiveStart =
      viewRange && entryStart < viewRange.start ? viewRange.start : entryStart;
    const effectiveEnd =
      viewRange && entryEnd > viewRange.end ? viewRange.end : entryEnd;

    switch (viewMode) {
      case "day": {
        const hours = Math.ceil(
          (effectiveEnd.getTime() - effectiveStart.getTime()) /
            (1000 * 60 * 60),
        );
        return Math.max(1, hours);
      }
      case "week":
      case "month": {
        const days = differenceInDays(effectiveEnd, effectiveStart) + 1;
        return Math.max(1, days);
      }
      case "year": {
        const months = effectiveEnd.getMonth() - effectiveStart.getMonth() + 1;
        return Math.max(1, months);
      }
      default:
        return 1;
    }
  };

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

  const isToday = (date: Date): boolean => {
    const today = new Date();
    switch (viewMode) {
      case "day":
        return isSameHour(date, today);
      case "week":
      case "month":
        return isSameDay(date, today);
      case "year":
        return isSameMonth(date, today);
      default:
        return false;
    }
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

                // Group and process overlapping entries by visual slot ranges
                const processedEntries = equipEntries
                  .map((entry) => {
                    const startIdx = getEntryStartSlotIndex(entry);
                    const span = getEntrySpan(entry);
                    const totalSlots = timeSlots.length;
                    const effectiveSpan = Math.min(span, totalSlots - startIdx);
                    return {
                      entry,
                      startIdx,
                      effectiveSpan,
                      endIdx: startIdx + effectiveSpan,
                    };
                  })
                  .filter((item) => item.startIdx >= 0);

                // Sort by startIdx ascending, then effectiveSpan descending
                processedEntries.sort((a, b) => {
                  if (a.startIdx !== b.startIdx) {
                    return a.startIdx - b.startIdx;
                  }
                  return b.effectiveSpan - a.effectiveSpan;
                });

                // Assign track indices using greedy interval coloring
                const trackEndSlots: number[] = [];
                const entryTrackMap = new Map<string, number>();

                processedEntries.forEach((item) => {
                  let assignedTrack = -1;
                  for (let i = 0; i < trackEndSlots.length; i++) {
                    if (trackEndSlots[i] <= item.startIdx) {
                      assignedTrack = i;
                      break;
                    }
                  }

                  if (assignedTrack === -1) {
                    assignedTrack = trackEndSlots.length;
                    trackEndSlots.push(item.endIdx);
                  } else {
                    trackEndSlots[assignedTrack] = item.endIdx;
                  }

                  entryTrackMap.set(item.entry.id, assignedTrack);
                });

                const numTracks = Math.max(1, trackEndSlots.length);
                const rowHeight =
                  numTracks > 1 ? Math.max(56, numTracks * 36) : 56;

                return (
                  <div
                    key={equip.id}
                    className="flex min-w-full w-fit border-b border-border"
                  >
                    {/* Equipment name cell */}
                    <div
                      className={cn(
                        yAxisWidth,
                        "group/equipment-label sticky left-0 z-10 flex items-center justify-between border-r border-border bg-card px-2 py-1.5",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="relative">
                          {equip.imageFileId ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/files/${equip.imageFileId}`}
                              alt=""
                              className="size-7 shrink-0 rounded-lg border border-border object-cover"
                            />
                          ) : (
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <Box className="size-4 text-primary" />
                            </div>
                          )}
                          <div
                            className={cn(
                              "absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-card",
                              pendingCount > 0
                                ? "bg-warning"
                                : "bg-success",
                            )}
                            title={
                              pendingCount > 0
                                ? t("equipmentInMaintenance")
                                : t("equipmentActive")
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="max-w-[9rem] truncate text-sm font-medium text-foreground">
                            {equip.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {locationLabel(equip) && (
                              <span
                                className="max-w-[7rem] truncate"
                                title={locationLabel(equip)}
                              >
                                {locationLabel(equip)}
                              </span>
                            )}
                            {locationLabel(equip) && pendingCount > 0 && (
                              <span>•</span>
                            )}
                            {pendingCount > 0 && (
                              <span className="text-primary font-medium">
                                {pendingCount}{" "}
                                {pendingCount !== 1 ? t("tasks") : t("task")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 opacity-0 transition-opacity group-hover/equipment-label:opacity-100 group-focus-within/equipment-label:opacity-100"
                            aria-label={t("equipmentActions", {
                              equipment: equip.name,
                            })}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => handleEditEquip(equip)}
                          >
                            <Pencil />
                            {tCommon("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => handleRemoveEquipment(equip.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            {tCommon("remove")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Timeline cells */}
                    <div className="relative isolate flex flex-1 overflow-hidden">
                      {timeSlots.map((slot, slotIdx) => {
                        const isDragOver =
                          dragOverCell &&
                          dragOverCell.equipmentId === equip.id &&
                          (viewMode === "day"
                            ? isSameHour(dragOverCell.date, slot)
                            : isSameDay(dragOverCell.date, slot));

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
                          ({ entry, startIdx, effectiveSpan }) => {
                            const totalSlots = timeSlots.length;
                            const startPercent = (startIdx / totalSlots) * 100;
                            const widthPercent =
                              (effectiveSpan / totalSlots) * 100;

                            // Check if this entry overlaps with any other visible entry on this equipment
                            const hasOverlaps = processedEntries.some(
                              (other) =>
                                other.entry.id !== entry.id &&
                                Math.max(startIdx, other.startIdx) <
                                  Math.min(
                                    startIdx + effectiveSpan,
                                    other.startIdx + other.effectiveSpan,
                                  ),
                            );

                            const trackIndex = entryTrackMap.get(entry.id) ?? 0;
                            const topStyle =
                              numTracks > 1 && hasOverlaps
                                ? `calc(4px + ${trackIndex} * ((100% - 4px) / ${numTracks}))`
                                : "4px";
                            const heightStyle =
                              numTracks > 1 && hasOverlaps
                                ? `calc((100% - 4px) / ${numTracks} - 4px)`
                                : "calc(100% - 8px)";

                            return (
                              <MaintenanceEntryBlock
                                key={entry.id}
                                entry={entry}
                                timeSlotsCount={timeSlots.length}
                                style={{
                                  position: "absolute",
                                  left: `calc(${startPercent}% + 2px)`,
                                  width: `calc(${widthPercent}% - 4px)`,
                                  top: topStyle,
                                  height: heightStyle,
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
