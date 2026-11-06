"use client";

import { MaintenanceEntry } from "../types";
import { cn } from "@/lib/utils";
import { GripVertical, Wrench } from "lucide-react";
import { useState } from "react";
import { EditEntryDialog } from "./edit-entry-dialog";
import { TaskType } from "../../../../prisma/generated/prisma/enums";

interface MaintenanceEntryBlockProps {
  entry: MaintenanceEntry;
  style?: React.CSSProperties;
  onDragStart: () => void;
  isDragging?: boolean;
  autoOpen?: boolean;
  onAutoOpenClose?: () => void;
}

export function MaintenanceEntryBlock({
  entry,
  style,
  onDragStart,
  isDragging,
  autoOpen = false,
  onAutoOpenClose,
}: MaintenanceEntryBlockProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const assignedWorkers = entry.assignments?.map((a) => a.worker) || [];

  const getTypeStyles = () => {
    switch (entry.type) {
      case TaskType.PREVENTIVE:
        return "bg-info/10 border-info/20 text-info";
      case TaskType.PREDICTIVE:
        return "bg-warning/10 border-warning/20 text-warning";
      case TaskType.CORRECTIVE:
        return "bg-destructive/10 border-destructive/20 text-destructive";
      default:
        return "bg-primary/10 border-primary/20 text-primary";
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    onDragStart();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDetailsOpen(true);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        style={style}
        className={cn(
          "rounded-md border px-2 py-1 cursor-grab active:cursor-grabbing group select-none",
          "flex items-center gap-1 overflow-hidden transition-[background-color,border-color,ring]",
          "hover:ring-2 hover:ring-ring hover:ring-offset-1 hover:ring-offset-background",
          getTypeStyles(),
          isDragging && "opacity-50 scale-95",
        )}
      >
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

      </div>

      <EditEntryDialog
        entry={entry}
        open={detailsOpen || autoOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open && autoOpen) onAutoOpenClose?.();
        }}
      />
    </>
  );
}
