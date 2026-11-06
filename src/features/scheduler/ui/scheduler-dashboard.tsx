"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { TaskType } from "../../../../prisma/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import type { OnboardingProgress } from "@/features/organization/shared/onboarding";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useSchedulerStore } from "../store/scheduler-provider";
import { GettingStarted } from "./getting-started";
import { SchedulerToolbar } from "./scheduler-toolbar";
import { TimelineGrid } from "./timeline-grid";
import {
  countOverdueScheduledMaintenance,
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
  const format = useFormatter();
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
  const overdueCount = countOverdueScheduledMaintenance(entries, now);

  const stats = {
    scheduled: entries.filter((e) => e.status === "scheduled").length,
    inProgress: entries.filter((e) => e.status === "in-progress").length,
    preventive: entries.filter((e) => e.type === TaskType.PREVENTIVE).length,
    corrective: entries.filter((e) => e.type === TaskType.CORRECTIVE).length,
    inspection: entries.filter((e) => e.type === TaskType.PREDICTIVE).length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <h1 className="shrink-0 text-xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      {onboarding && <GettingStarted progress={onboarding} />}
      <Item
        role="status"
        aria-label={t("nextMaintenance.title")}
        variant="outline"
        size="sm"
        className="w-full shrink-0"
      >
        <ItemMedia variant="icon">
          <CalendarDays aria-hidden="true" />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemHeader className="flex-wrap">
            <ItemTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("nextMaintenance.title")}
            </ItemTitle>
            {overdueCount > 0 && (
              <Badge variant="destructive">
                {t("nextMaintenance.overdue", { count: overdueCount })}
              </Badge>
            )}
          </ItemHeader>
          {nextMaintenance ? (
            <>
              <p className="truncate font-medium text-foreground">
                {nextMaintenance.title}
              </p>
              <ItemDescription>
                {equipment.find(
                  (item) => item.id === nextMaintenance.equipmentId,
                )?.name ?? ""}
                {" · "}
                {format.dateTime(new Date(nextMaintenance.startTime), {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone,
                })}
              </ItemDescription>
            </>
          ) : (
            <ItemDescription>{t("nextMaintenance.none")}</ItemDescription>
          )}
        </ItemContent>
      </Item>
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Stat
            label={t("stats.preventive")}
            value={stats.preventive}
            marker="border-info/40 bg-info/20"
          />
          <Stat
            label={t("stats.corrective")}
            value={stats.corrective}
            marker="border-destructive/40 bg-destructive/20"
          />
          <Stat
            label={t("stats.inspection")}
            value={stats.inspection}
            marker="border-warning/40 bg-warning/20"
          />
        </div>
        <Separator orientation="vertical" className="hidden h-5 sm:block" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Stat label={t("stats.equipment")} value={equipment.length} />
          <Stat label={t("stats.scheduled")} value={stats.scheduled} />
          <Stat
            label={t("stats.inProgress")}
            value={stats.inProgress}
            valueClassName="text-chart-3"
          />
        </div>
      </div>

      <SchedulerToolbar />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TimelineGrid
          openTaskId={openTaskId}
          onTaskLinkOpened={handleTaskLinkOpened}
        />
      </div>

      <p className="shrink-0 text-xs text-muted-foreground">
        {t("footer.clickHint")} • {t("footer.dragHint")} •{" "}
        {t("footer.zoomHint")}
      </p>
    </div>
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
          className={cn("mb-0.5 size-3 shrink-0 self-center rounded-full border", marker)}
        />
      )}
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-base font-semibold tabular-nums", valueClassName)}>
        {value}
      </span>
    </div>
  );
}
