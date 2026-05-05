"use client";

import { Badge } from "@/components/ui/badge";
import { useSchedulerStore } from "@/lib/scheduler-store";
import { MaintenanceEntry } from "@/lib/scheduler-types";
import { cn } from "@/lib/utils";
import { addMinutes } from "date-fns";
import { GripVertical, Wrench } from "lucide-react";
import { useRef, useState } from "react";
import { TaskType } from "../../generated/prisma/enums";
import { EditEntryDialog } from "./edit-entry-dialog";

interface MaintenanceEntryBlockProps {
  entry: MaintenanceEntry;
  style?: React.CSSProperties;
  onDragStart: () => void;
  isDragging?: boolean;
  timeSlotsCount: number;
}

export function MaintenanceEntryBlock({
  entry,
  style,
  onDragStart,
  isDragging,
  timeSlotsCount,
}: MaintenanceEntryBlockProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { updateEntry, viewMode } =
    useSchedulerStore();

  const assignedWorkers = entry.assignments?.map((a) => a.worker) || [];

  // Resize state
  const [isResizing, setIsResizing] = useState<"start" | "end" | null>(null);
  const [resizeOffset, setResizeOffset] = useState(0);
  const entryRef = useRef<HTMLDivElement>(null);

  const getStatusBadge = () => {
    switch (entry.status) {
      case "scheduled":
        return (
          <Badge variant="secondary" className="text-xs">
            Scheduled
          </Badge>
        );
      case "in-progress":
        return (
          <Badge className="bg-chart-3/20 text-chart-3 border-chart-3/40 text-xs">
            In Progress
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-chart-1/20 text-chart-1 border-chart-1/40 text-xs">
            Completed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {entry.status}
          </Badge>
        );
    }
  };

  const getTypeStyles = () => {
    switch (entry.type) {
      case TaskType.PREVENTIVE:
        return "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400";
      case TaskType.INSPECTION:
        return "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400";
      case TaskType.CORRECTIVE:
        return "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400";
      default:
        return "bg-primary/10 border-primary/20 text-primary";
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (isResizing) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    onDragStart();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isResizing) return;

    e.stopPropagation();
    setDetailsOpen(true);
  };

  // --- Resizing Logic ---

  const handleResizeStart = (type: "start" | "end", e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(type);
    setResizeOffset(0);

    const startX = e.clientX;
    const containerWidth =
      entryRef.current?.parentElement?.getBoundingClientRect().width || 1000;
    const pixelsPerSlot = containerWidth / timeSlotsCount;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setResizeOffset(deltaX);
    };

    const onMouseUp = async (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      const finalDeltaX = upEvent.clientX - startX;
      // Keep isResizing state briefly to prevent handleClick from opening dialog
      setTimeout(() => setIsResizing(null), 100);
      setResizeOffset(0);

      if (Math.abs(finalDeltaX) < 5) return;

      // Calculate time change based on viewMode
      let pixelsPerMinute = 0;
      if (viewMode === "day") pixelsPerMinute = pixelsPerSlot / 60;
      else if (viewMode === "week") pixelsPerMinute = pixelsPerSlot / (24 * 60);
      else if (viewMode === "month")
        pixelsPerMinute = pixelsPerSlot / (24 * 60);
      else if (viewMode === "year")
        pixelsPerMinute = pixelsPerSlot / (30 * 24 * 60);

      const minutesChange = finalDeltaX / pixelsPerMinute;

      // Snapping
      let snappedMinutes = minutesChange;
      if (viewMode === "day") {
        snappedMinutes = Math.round(minutesChange / 15) * 15;
      } else {
        snappedMinutes = Math.round(minutesChange / (24 * 60)) * (24 * 60);
      }

      if (snappedMinutes === 0) return;

      const newStartTime = new Date(entry.startTime);
      const newEndTime = new Date(entry.endTime);

      if (type === "start") {
        const potentialStart = addMinutes(newStartTime, snappedMinutes);
        if (potentialStart < newEndTime) {
          await updateEntry(entry.id, { startTime: potentialStart });
        }
      } else {
        const potentialEnd = addMinutes(newEndTime, snappedMinutes);
        if (potentialEnd > newStartTime) {
          await updateEntry(entry.id, { endTime: potentialEnd });
        }
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const visualStyle = {
    ...style,
    ...(isResizing === "start"
      ? {
          left: `calc(${style?.left || "0px"} + ${resizeOffset}px)`,
          width: `calc(${style?.width || "0px"} - ${resizeOffset}px)`,
        }
      : {}),
    ...(isResizing === "end"
      ? {
          width: `calc(${style?.width || "0px"} + ${resizeOffset}px)`,
        }
      : {}),
  };

  return (
    <>
      <div
        ref={entryRef}
        draggable={!isResizing}
        onDragStart={handleDragStart}
        onClick={handleClick}
        style={visualStyle}
        className={cn(
          "rounded-md border px-2 py-1 cursor-grab active:cursor-grabbing group select-none",
          "flex items-center gap-1 overflow-hidden transition-[background-color,border-color,ring]",
          "hover:ring-2 hover:ring-ring hover:ring-offset-1 hover:ring-offset-background",
          getTypeStyles(),
          isDragging && "opacity-50 scale-95",
          isResizing &&
            "cursor-col-resize ring-2 ring-primary border-primary/50 z-50",
        )}
      >
        {/* Left Resize Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => handleResizeStart("start", e)}
        />

        <GripVertical className="w-3 h-3 flex-shrink-0 opacity-50" />
        <Wrench className="w-3 h-3 flex-shrink-0" />
        <span className="text-xs font-medium truncate flex-1">
          {entry.title}
        </span>

        {/* Initials stack */}
        <div className="flex -space-x-2 overflow-hidden">
          {assignedWorkers.slice(0, 2).map((worker) => (
            <div
              key={worker.id}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-background bg-primary text-[8px] font-bold text-primary-foreground"
              title={worker.name}
            >
              {getInitials(worker.name)}
            </div>
          ))}
          {assignedWorkers.length > 2 && (
            <div className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-background bg-muted text-[8px] font-bold text-muted-foreground">
              +{assignedWorkers.length - 2}
            </div>
          )}
        </div>

        {/* Right Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => handleResizeStart("end", e)}
        />
      </div>

      <EditEntryDialog
        entry={entry}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  );
}
