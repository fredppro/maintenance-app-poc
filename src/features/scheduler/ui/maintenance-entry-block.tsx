"use client";

import { MaintenanceEntry, ViewMode } from "../types";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { EditEntryDialog } from "./edit-entry-dialog";
import { getTaskStatusPresentation } from "./task-status-presentation";
import { DEFAULT_ORGANIZATION_TIMEZONE } from "@/features/organization/shared/organization-settings";
import { formatWorkerWorkDuration } from "../utils/worker-hours";

const maintenanceTypes = {
  PREVENTIVE: "preventive",
  PREDICTIVE: "predictive",
  CORRECTIVE: "corrective",
} as const;

interface MaintenanceEntryBlockProps {
  entry: MaintenanceEntry;
  style?: React.CSSProperties;
  onDragStart: () => void;
  isDragging?: boolean;
  viewMode?: ViewMode;
  timeZone?: string;
}

export function MaintenanceEntryBlock({
  entry,
  style,
  onDragStart,
  isDragging,
  viewMode = "month",
  timeZone = DEFAULT_ORGANIZATION_TIMEZONE,
}: MaintenanceEntryBlockProps) {
  const t = useTranslations("Grid");
  const tForm = useTranslations("Form");
  const format = useFormatter();
  const weekly = viewMode === "week";
  const height = typeof style?.height === "number" ? style.height : weekly ? 72 : 64;
  const compact = height < 56;
  const rich = height >= 72;
  const expanded = height >= 90;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const assignedWorkers = entry.assignments?.map((a) => a.worker) || [];
  const firstWorker = assignedWorkers[0];
  const workerNames = assignedWorkers.map((worker) => worker.name).join(", ");
  const knownUnassigned = entry.assignments?.length === 0;
  const typeLabel = tForm(maintenanceTypes[entry.type]);
  const statusLabels: Record<string, string> = {
    scheduled: tForm("statusTypes.scheduled"),
    "in-progress": tForm("statusTypes.in-progress"),
    completed: tForm("statusTypes.completed"),
    cancelled: tForm("statusTypes.cancelled"),
  };
  const statusLabel = statusLabels[entry.status] ?? t("unknownStatus");
  const status = getTaskStatusPresentation(entry.status);
  const { Icon: StatusIcon } = status;
  const start = new Date(entry.startTime);
  const end = entry.endTime ? new Date(entry.endTime) : null;
  const timeOptions = { hour: "2-digit", minute: "2-digit", timeZone } as const;
  const startLabel = t("startAt", { time: format.dateTime(start, timeOptions) });
  const duration = formatWorkerWorkDuration(entry.startTime, entry.endTime);
  const description = [
    typeLabel,
    end
      ? format.dateTimeRange(start, end, { dateStyle: "medium", timeStyle: "short", timeZone })
      : format.dateTime(start, { dateStyle: "medium", timeStyle: "short", timeZone }),
    duration ? t("scheduledDuration", { duration }) : null,
    workerNames || (knownUnassigned ? t("noAssignees") : null),
  ].filter(Boolean).join(" \u00b7 ");

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
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-maintenance-status={entry.status}
        data-density={viewMode === "day" || weekly ? "comfortable" : "compact"}
        aria-label={t("openTask", {
          title: entry.title,
          status: statusLabel,
        })}
        aria-description={description}
        title={`${entry.title} \u00b7 ${statusLabel} \u00b7 ${description}`}
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        style={style}
        className={cn(
          "group @container/task h-auto min-w-0 flex-col items-stretch justify-center gap-0.5 overflow-hidden rounded-lg border px-2 py-1 text-left font-normal whitespace-nowrap shadow-none select-none [&_[data-icon]]:size-4",
          "cursor-grab active:cursor-grabbing pointer-coarse:cursor-pointer",
          status.surface,
          isDragging && "opacity-50",
        )}
      >
        {rich && (
          <span
            data-slot="timeline-entry-header"
            className="hidden h-4 min-w-0 shrink-0 items-center gap-1.5 text-xs @[6rem]/task:flex"
          >
            <span data-slot="timeline-entry-type" title={typeLabel} className="min-w-0 flex-1 truncate">
              {typeLabel}
            </span>
            <time
              dateTime={start.toISOString()}
              className="hidden shrink-0 text-muted-foreground tabular-nums @[10rem]/task:block"
            >
              {startLabel}
            </time>
            <span data-slot="timeline-entry-status" title={statusLabel} aria-hidden="true" className="flex shrink-0">
              <StatusIcon data-icon="inline-end" strokeWidth={1.5} />
            </span>
          </span>
        )}
        <span className="flex min-w-0 flex-none items-start gap-1.5">
          <GripVertical
            aria-hidden="true"
            strokeWidth={1.5}
            className="hidden size-3 shrink-0 self-center @[12rem]/task:block pointer-coarse:hidden"
          />
          <span
            data-slot="timeline-entry-compact-status"
            title={statusLabel}
            aria-hidden="true"
            className={cn(
              "hidden h-5 shrink-0 items-center @[4rem]/task:flex",
              rich && "@[6rem]/task:hidden",
            )}
          >
            <StatusIcon data-icon="inline-start" strokeWidth={1.5} />
          </span>
          <span className={cn(
            "min-w-0 flex-1 line-clamp-2 text-sm font-normal whitespace-normal text-foreground",
            compact ? "line-clamp-1" : !expanded && (rich ? "@[6rem]/task:line-clamp-1" : "@[5rem]/task:line-clamp-1"),
          )} data-slot="timeline-entry-title">
            {entry.title}
          </span>
          {!rich && (
            <span aria-hidden="true" className="hidden shrink-0 text-xs @[24rem]/task:inline">
              {statusLabel}
            </span>
          )}
        </span>

        <span className={cn(
          "min-w-0 items-center gap-1 text-xs font-normal text-muted-foreground",
          compact ? "hidden" : rich ? "hidden @[4.25rem]/task:flex" : "hidden @[5rem]/task:flex",
        )} data-slot="timeline-entry-footer">
          <span className={cn(
            "flex flex-1 items-center gap-1.5",
            duration ? "min-w-0" : "min-w-max",
          )}>
            {!rich && (
              <span data-slot="timeline-entry-type" title={typeLabel} className="hidden min-w-0 flex-1 truncate @[16rem]/task:inline">
                {typeLabel}
              </span>
            )}
            {(!rich || !duration) && (
              <time
                dateTime={start.toISOString()}
                className={cn(
                  "min-w-0 truncate tabular-nums",
                  rich ? "@[10rem]/task:hidden" : duration && "hidden shrink-0 @[12rem]/task:block",
                )}
              >
                {startLabel}
              </time>
            )}
            {rich && !duration && (
              <span className="hidden min-w-0 truncate @[10rem]/task:block">{statusLabel}</span>
            )}
            {duration && (
              <span
                data-slot="timeline-entry-duration"
                title={t("scheduledDuration", { duration })}
                className="min-w-0 truncate tabular-nums"
              >
                {duration}
              </span>
            )}
          </span>
          {firstWorker ? (
            <span
              data-slot="timeline-entry-assignees"
              title={workerNames}
              aria-hidden="true"
              className="hidden min-w-0 max-w-1/2 shrink items-center gap-1 @[6rem]/task:flex"
            >
              <span data-slot="timeline-entry-worker-stack" className="flex shrink-0 items-center">
                {assignedWorkers.slice(0, 2).map((worker, index) => (
                  <Avatar
                    key={worker.id}
                    title={worker.name}
                    className={cn(
                      "size-5 border border-background",
                      index > 0 && "-ml-2 hidden @[6.5rem]/task:flex",
                    )}
                  >
                    <AvatarFallback className="bg-primary text-xs font-normal text-primary-foreground">
                      {getInitials(worker.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </span>
              <span className="hidden min-w-0 truncate @[20rem]/task:block">{firstWorker.name}</span>
              {assignedWorkers.length > 2 && (
                <span data-slot="timeline-entry-assignee-count" className="hidden shrink-0 tabular-nums @[8rem]/task:block">
                  +{assignedWorkers.length - 2}
                </span>
              )}
            </span>
          ) : knownUnassigned && (
            <span className="hidden min-w-0 max-w-1/2 truncate @[10rem]/task:block">
              {t("noAssignees")}
            </span>
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
