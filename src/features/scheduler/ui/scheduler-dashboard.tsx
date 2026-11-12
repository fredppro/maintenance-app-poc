"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { TaskType } from "../../../../prisma/generated/prisma/enums";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import type { OnboardingProgress } from "@/features/organization/shared/onboarding";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Plus,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSchedulerStore } from "../store/scheduler-provider";
import { GettingStarted } from "./getting-started";
import { SchedulerToolbar } from "./scheduler-toolbar";
import { TimelineGrid } from "./timeline-grid";
import { AddEntryDialog } from "./add-entry-dialog";
import { EditEntryDialog } from "./edit-entry-dialog";
import { getTaskStatusPresentation } from "./task-status-presentation";
import {
  getOverdueScheduledMaintenance,
  getNextScheduledMaintenance,
} from "../utils/insights";

/**
 * Schedule page body: optional getting-started checklist, summary strip, toolbar, timeline and legend.
 * `onboarding` is null when the checklist should not show.
 */
export function SchedulerDashboard({
  onboarding = null,
}: {
  onboarding?: OnboardingProgress | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get("taskId");
  const entries = useSchedulerStore((state) => state.entries);
  const equipment = useSchedulerStore((state) => state.equipment);
  const timeZone = useSchedulerStore((state) => state.timeZone);
  const setCurrentDate = useSchedulerStore((state) => state.setCurrentDate);
  const setViewMode = useSchedulerStore((state) => state.setViewMode);
  const t = useTranslations("Dashboard");
  const tForm = useTranslations("Form");
  const format = useFormatter();
  const taskSearch = useSchedulerStore((state) => state.searchQuery);
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const targetTask = entries.find((entry) => entry.id === openTaskId);
  const handleTaskLinkOpened = useCallback(() => {
    router.replace("/");
  }, [router]);

  useEffect(() => {
    if (!targetTask) return;
    setCurrentDate(new Date(targetTask.startTime));
    setViewMode("week");
  }, [setCurrentDate, setViewMode, targetTask]);

  const now = useNow().getTime();
  const nextMaintenance = getNextScheduledMaintenance(entries, now);
  const overdueTasks = getOverdueScheduledMaintenance(entries, now);
  const overdueTask = overdueTasks[0];
  const overdueEquipment = equipment.find(
    (item) => item.id === overdueTask?.equipmentId,
  );
  const nextEquipment = equipment.find((item) => item.id === nextMaintenance?.equipmentId);

  const stats = {
    scheduled: entries.filter((e) => e.status === "scheduled").length,
    inProgress: entries.filter((e) => e.status === "in-progress").length,
    completed: entries.filter((e) => e.status === "completed").length,
    cancelled: entries.filter((e) => e.status === "cancelled").length,
    preventive: entries.filter((e) => e.type === TaskType.PREVENTIVE).length,
    corrective: entries.filter((e) => e.type === TaskType.CORRECTIVE).length,
    predictive: entries.filter((e) => e.type === TaskType.PREDICTIVE).length,
  };

  return (
    <PageBody layout="workspace">
      <PageHeader
        title={t("title")}
        layout="compact"
        actions={
          <Button
            type="button"
            size="sm"
            onClick={() => setNewEntryOpen(true)}
            aria-label={tForm("schedule")}
          >
            <Plus data-icon="inline-start" />
            <span className="hidden lg:inline">{tForm("schedule")}</span>
            <span className="lg:hidden">{tForm("submit")}</span>
          </Button>
        }
      />
      {onboarding && <GettingStarted progress={onboarding} />}
      <div
        role="region"
        aria-label={t("nextMaintenance.summary")}
        className="flex shrink-0 flex-col gap-3"
      >
        {overdueTask && (
          <Alert
            variant="destructive"
            className="min-w-0 has-[>svg]:grid-cols-[1rem_minmax(0,1fr)_auto]"
          >
            <CircleAlert aria-hidden="true" />
            <AlertTitle
              role="heading"
              aria-level={2}
              className="line-clamp-none break-words text-sm"
            >
              {t("nextMaintenance.overdueTitle")}
            </AlertTitle>
            <AlertDescription className="min-w-0 gap-1 text-xs !text-muted-foreground">
              <span className="text-foreground">
                {t("nextMaintenance.overdue", {
                  count: overdueTasks.length,
                })}
              </span>
              <span className="break-words">
                {[overdueEquipment?.name, format.dateTime(
                  new Date(overdueTask.startTime),
                  {
                    dateStyle: "medium",
                    timeZone,
                  },
                )].filter(Boolean).join(" · ")}
              </span>
            </AlertDescription>
            <Button asChild size="sm" variant="outline" className="col-start-3 row-span-2 row-start-1 self-center">
              <Link
                href={`/?taskId=${encodeURIComponent(overdueTask.id)}`}
              >
                {t(
                  overdueTasks.length > 1
                    ? "nextMaintenance.reviewOldestTask"
                    : "nextMaintenance.reviewTask",
                )}
                <ArrowRight data-icon="inline-end" aria-hidden="true" className="hidden sm:block" />
              </Link>
            </Button>
          </Alert>
        )}
        {nextMaintenance && (
          <Item
            role="region"
            aria-label={t("nextMaintenance.title")}
            variant="default"
            size="sm"
            className="min-w-0 shrink-0 items-center px-1 py-1"
          >
            <ItemMedia variant="icon">
              <CalendarDays aria-hidden="true" />
            </ItemMedia>
            <ItemContent className="min-w-0 gap-0.5">
              <ItemTitle role="heading" aria-level={2} className="text-xs">
                {t("nextMaintenance.title")}
              </ItemTitle>
              <p className="truncate text-sm font-medium">
                {nextMaintenance.title}
              </p>
              <ItemDescription className="line-clamp-1">
                {[nextEquipment?.name, format.dateTime(
                  new Date(nextMaintenance.startTime),
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone,
                  },
                )]
                  .filter(Boolean)
                  .join(" · ")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={`/?taskId=${encodeURIComponent(nextMaintenance.id)}`}
                  aria-label={t("nextMaintenance.openTask", {
                    title: nextMaintenance.title,
                  })}
                >
                  {t("nextMaintenance.reviewTask")}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </ItemActions>
          </Item>
        )}
      </div>
      <div className="flex min-h-[28rem] shrink-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <SchedulerToolbar />
        <Separator />
        <div className="flex min-h-64 flex-1 overflow-hidden">
          <TimelineGrid searchQuery={taskSearch} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-3 py-3 text-xs sm:px-4">
          <div
            role="group"
            aria-label={t("stats.taskTypes")}
            className="flex flex-wrap gap-x-4 gap-y-2"
          >
            <span className="sr-only">
              {t("stats.taskTypes")}
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Stat
                label={t("stats.preventive")}
                value={stats.preventive}
                marker="border-info/40 bg-info/20"
              />
              <Stat
                label={t("stats.corrective")}
                value={stats.corrective}
                marker="border-chart-4/40 bg-chart-4/20"
              />
              <Stat
                label={t("stats.predictive")}
                value={stats.predictive}
                marker="border-warning/40 bg-warning/20"
              />
            </div>
          </div>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <div
            role="group"
            aria-label={t("stats.workStatus")}
            className="flex flex-wrap gap-x-4 gap-y-2"
          >
            <span className="sr-only">
              {t("stats.workStatus")}
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Stat
                label={t("stats.scheduled")}
                value={stats.scheduled}
                marker={getTaskStatusPresentation("scheduled").marker}
              />
              <Stat
                label={t("stats.inProgress")}
                value={stats.inProgress}
                marker={getTaskStatusPresentation("in-progress").marker}
              />
              <Stat
                label={t("stats.completed")}
                value={stats.completed}
                marker={getTaskStatusPresentation("completed").marker}
              />
              <Stat
                label={t("stats.cancelled")}
                value={stats.cancelled}
                marker={getTaskStatusPresentation("cancelled").marker}
              />
            </div>
          </div>
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <div
            role="group"
            aria-label={t("stats.assets")}
            className="flex flex-wrap gap-x-4 gap-y-2"
          >
            <span className="sr-only">
              {t("stats.assets")}
            </span>
            <Stat label={t("stats.equipment")} value={equipment.length} />
          </div>
        </div>

      </div>

      <p className="shrink-0 text-xs text-muted-foreground">
        <span className="pointer-coarse:hidden">
          {t("footer.clickHint")} • {t("footer.dragHint")} •{" "}
          {t("footer.zoomHint")}
        </span>
        <span className="hidden pointer-coarse:inline">
          {t("footer.tapHint")}
        </span>
      </p>
      {newEntryOpen && (
        <AddEntryDialog
          open={newEntryOpen}
          onOpenChange={setNewEntryOpen}
          selectedCell={null}
        />
      )}
      {targetTask && (
        <EditEntryDialog
          key={targetTask.id}
          entry={targetTask}
          open
          onOpenChange={(open) => {
            if (!open) handleTaskLinkOpened();
          }}
        />
      )}
    </PageBody>
  );
}

function Stat({
  label,
  value,
  marker,
  valueClassName = "text-foreground",
}: {
  label: string;
  value: number;
  marker?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      {marker && (
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 self-center rounded-full border", marker)}
        />
      )}
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-semibold tabular-nums", valueClassName)}>
        {value}
      </span>
    </div>
  );
}
