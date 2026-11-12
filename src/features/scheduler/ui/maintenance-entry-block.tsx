"use client";

import { MaintenanceEntry } from "../types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { EditEntryDialog } from "./edit-entry-dialog";
import { getTaskStatusPresentation } from "./task-status-presentation";

interface MaintenanceEntryBlockProps {
  entry: MaintenanceEntry;
  style?: React.CSSProperties;
  onDragStart: () => void;
  isDragging?: boolean;
}

export function MaintenanceEntryBlock({
  entry,
  style,
  onDragStart,
  isDragging,
}: MaintenanceEntryBlockProps) {
  const t = useTranslations("Grid");
  const tForm = useTranslations("Form");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const assignedWorkers = entry.assignments?.map((a) => a.worker) || [];
  const statusLabels: Record<string, string> = {
    scheduled: tForm("statusTypes.scheduled"),
    "in-progress": tForm("statusTypes.in-progress"),
    completed: tForm("statusTypes.completed"),
    cancelled: tForm("statusTypes.cancelled"),
  };
  const statusLabel = statusLabels[entry.status] ?? t("unknownStatus");
  const status = getTaskStatusPresentation(entry.status);

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
      <Button
        type="button"
        variant="outline"
        data-maintenance-status={entry.status}
        aria-label={t("openTask", {
          title: entry.title,
          status: statusLabel,
        })}
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        style={style}
        className={cn(
          "group h-auto min-w-0 justify-start gap-1.5 overflow-hidden rounded-md border px-2 py-1 text-left whitespace-nowrap shadow-none select-none",
          "cursor-grab active:cursor-grabbing pointer-coarse:cursor-pointer",
          status.surface,
          isDragging && "opacity-50",
        )}
      >
        <GripVertical
          aria-hidden="true"
          className="size-3 shrink-0 opacity-60 pointer-coarse:hidden"
        />
        <span
          aria-hidden="true"
          title={statusLabel}
          className={cn("size-2 shrink-0 rounded-full", status.marker)}
        />
        <span className="text-xs font-medium truncate flex-1">
          {entry.title}
        </span>

        <span className="flex -space-x-1.5 overflow-hidden" aria-hidden="true">
          {assignedWorkers.slice(0, 2).map((worker) => (
            <Avatar
              key={worker.id}
              className="size-5 border-2 border-background"
              title={worker.name}
            >
              <AvatarFallback className="text-[8px] font-medium">{getInitials(worker.name)}</AvatarFallback>
            </Avatar>
          ))}
          {assignedWorkers.length > 2 && (
            <Avatar className="size-5 border-2 border-background">
              <AvatarFallback className="text-[8px] font-medium">+{assignedWorkers.length - 2}</AvatarFallback>
            </Avatar>
          )}
        </span>
      </Button>

      <EditEntryDialog
        entry={entry}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  );
}
