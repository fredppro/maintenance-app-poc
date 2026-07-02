"use client";

import { Button } from "@/components/ui/button";
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
import { APPLICATION_LOCALES } from "@/i18n/config";
import {
  getValidLocale,
  LOCALE_MAP
} from "@/i18n/locale";
import { useSchedulerStore } from "@/lib/scheduler-store";
import { MaintenanceEntry } from "@/lib/scheduler-types";
import { cn } from "@/lib/utils";
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
  Loader2,
  MoreVertical,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddEntryDialog } from "./add-entry-dialog";
import { MaintenanceEntryBlock } from "./maintenance-entry-block";

export function TimelineGrid() {
  const locale = getValidLocale(useLocale());
  const dateFnsLocale = LOCALE_MAP[locale];
  const config = APPLICATION_LOCALES[locale];
  const t = useTranslations("Grid");
  const tCommon = useTranslations("Common");

  const {
    equipment,
    entries,
    viewMode,
    currentDate,
    isLoading,
    moveEntry,
    setViewMode,
    setCurrentDate,
    addEquipment,
    updateEquipment,
    removeEquipment,
  } = useSchedulerStore();

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
  const [editingEquipment, setEditingEquipment] = useState<{
    id: string;
    name: string;
    category: string | null;
  } | null>(null);
  const [newEquipName, setNewEquipName] = useState("");
  const [newEquipCategory, setNewEquipCategory] = useState("");

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

  const handleDrop = (date: Date, equipmentId: string) => {
    if (draggedEntry) {
      moveEntry(draggedEntry.id, date, equipmentId);
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

  const handleAddEquipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEquipName.trim()) return;

    try {
      if (editingEquipment) {
        await updateEquipment(
          editingEquipment.id,
          newEquipName.trim(),
          newEquipCategory.trim() || undefined,
        );
        toast.success("Equipment updated");
      } else {
        await addEquipment(
          newEquipName.trim(),
          newEquipCategory.trim() || undefined,
        );
        toast.success("Equipment added");
      }
      setNewEquipName("");
      setNewEquipCategory("");
      setEditingEquipment(null);
      setAddEquipDialogOpen(false);
    } catch (error) {
      toast.error(
        editingEquipment
          ? "Failed to update equipment"
          : "Failed to add equipment",
      );
    }
  };

  const handleEditEquip = (equip: any) => {
    setEditingEquipment(equip);
    setNewEquipName(equip.name);
    setNewEquipCategory(equip.category || "");
    setAddEquipDialogOpen(true);
  };

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

  const cellWidth =
    viewMode === "month"
      ? "min-w-[100px]"
      : viewMode === "year"
        ? "min-w-[80px]"
        : "min-w-[100px]";
  const yAxisWidth = "w-72 min-w-[18rem]";

  const totalTasksInView = useMemo(() => {
    return equipment.reduce(
      (acc, equip) => acc + getEntriesForEquipment(equip.id).length,
      0,
    );
  }, [equipment, getEntriesForEquipment]);

  return (
    <>
      <div
        ref={gridRef}
        className="flex-1 overflow-auto border border-border rounded-lg bg-card relative"
      >
        {isLoading && (
          <div className="absolute inset-0 z-50 bg-background/50 flex items-center justify-center backdrop-blur-[1px]">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        <div className="min-w-full w-fit h-full flex flex-col">
          {/* Header row */}
          <div className="flex sticky top-0 z-20 bg-card border-b border-border flex-shrink-0 min-w-full w-fit">
            <div
              className={cn(
                yAxisWidth,
                "sticky left-0 z-30 bg-card border-r border-border p-3 flex items-center justify-between",
              )}
            >
              <span className="font-semibold text-sm text-foreground">
                {t("equipment")}
              </span>

              <Dialog
                open={addEquipDialogOpen}
                onOpenChange={(open) => {
                  setAddEquipDialogOpen(open);
                  if (!open) {
                    setEditingEquipment(null);
                    setNewEquipName("");
                    setNewEquipCategory("");
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditingEquipment(null);
                      setNewEquipName("");
                      setNewEquipCategory("");
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingEquipment
                        ? t("editEquipment")
                        : t("addEquipment")}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddEquipSubmit} className="space-y-4">
                    <FieldGroup>
                      <Field>
                        <FieldLabel>{t("equipmentName")}</FieldLabel>
                        <Input
                          value={newEquipName}
                          onChange={(e) => setNewEquipName(e.target.value)}
                          placeholder="e.g., CNC Machine G7"
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel>{t("category")}</FieldLabel>
                        <Input
                          value={newEquipCategory}
                          onChange={(e) => setNewEquipCategory(e.target.value)}
                          placeholder="e.g., Manufacturing"
                          list="timeline-categories"
                        />
                        <datalist id="timeline-categories">
                          {equipCategories.map((cat) => (
                            <option key={cat} value={cat} />
                          ))}
                        </datalist>
                      </Field>
                    </FieldGroup>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAddEquipDialogOpen(false)}
                      >
                        {tCommon("cancel")}
                      </Button>
                      <Button type="submit" disabled={!newEquipName.trim()}>
                        {editingEquipment ? tCommon("save") : t("addEquipment")}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex flex-1">
              {timeSlots.map((slot, idx) => (
                <div
                  key={idx}
                  onClick={() => handleHeaderClick(slot)}
                  className={cn(
                    cellWidth,
                    "flex-1 p-2 text-center text-sm font-medium border-r border-border text-muted-foreground transition-colors",
                    (viewMode === "week" || viewMode === "month") &&
                      "cursor-pointer hover:bg-accent hover:text-foreground",
                    isToday(slot) && "bg-primary/10 text-primary",
                  )}
                >
                  {formatHeader(slot)}
                </div>
              ))}
            </div>
          </div>

          {/* Equipment rows */}
          <div className="flex-1 min-w-full w-fit">
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
                  numTracks > 1 ? Math.max(64, numTracks * 40) : 64;

                return (
                  <div
                    key={equip.id}
                    className="flex border-b border-border last:border-b-0 group min-w-full w-fit"
                  >
                    {/* Equipment name cell */}
                    <div
                      className={cn(
                        yAxisWidth,
                        "sticky left-0 z-10 bg-card border-r border-border p-3 flex items-center justify-between",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Box className="w-4 h-4 text-primary" />
                          </div>
                          <div
                            className={cn(
                              "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-card",
                              pendingCount > 0
                                ? "bg-amber-500"
                                : "bg-emerald-500",
                            )}
                            title={
                              pendingCount > 0 ? "In Maintenance" : "Active"
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate max-w-[10rem]">
                            {equip.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                            {equip.category && (
                              <span className="truncate max-w-[6rem]">
                                {equip.category}
                              </span>
                            )}
                            {equip.category && pendingCount > 0 && (
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
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => handleEditEquip(equip)}
                          >
                            <Settings className="w-4 h-4" />
                            {tCommon("settings")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => removeEquipment(equip.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            {tCommon("remove")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Timeline cells */}
                    <div className="flex relative flex-1">
                      {timeSlots.map((slot, slotIdx) => {
                        const isDragOver =
                          dragOverCell &&
                          dragOverCell.equipmentId === equip.id &&
                          (viewMode === "day"
                            ? isSameHour(dragOverCell.date, slot)
                            : isSameDay(dragOverCell.date, slot));

                        return (
                          <div
                            key={slotIdx}
                            className={cn(
                              cellWidth,
                              "flex-1 border-r border-border cursor-pointer transition-colors relative",
                              "hover:bg-accent/50",
                              isDragOver && "bg-primary/20",
                              isToday(slot) && "bg-primary/5",
                            )}
                            style={{ height: `${rowHeight}px` }}
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
              <div className="p-8 text-center text-muted-foreground italic">
                {t("noEquipment")}
              </div>
            )}

            {viewMode === "day" && !isLoading && totalTasksInView === 0 && (
              <div className="sticky left-0 right-0 p-4 text-center text-sm text-muted-foreground bg-muted/20 border-b border-border">
                {t("noTasks")}
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
