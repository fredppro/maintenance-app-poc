"use client";

import { useTranslations } from "next-intl";
import { TaskType } from "../../../../prisma/generated/prisma/enums";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSchedulerStore } from "../store/scheduler-provider";
import { SchedulerToolbar } from "./scheduler-toolbar";
import { TimelineGrid } from "./timeline-grid";

/** Schedule page body: summary strip, toolbar, timeline and legend. */
export function SchedulerDashboard() {
  const entries = useSchedulerStore((state) => state.entries);
  const equipment = useSchedulerStore((state) => state.equipment);
  const t = useTranslations("Dashboard");

  const stats = {
    scheduled: entries.filter((e) => e.status === "scheduled").length,
    inProgress: entries.filter((e) => e.status === "in-progress").length,
    preventive: entries.filter((e) => e.type === TaskType.PREVENTIVE).length,
    corrective: entries.filter((e) => e.type === TaskType.CORRECTIVE).length,
    inspection: entries.filter((e) => e.type === TaskType.INSPECTION).length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <h1 className="sr-only">{t("title")}</h1>
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
        <TimelineGrid />
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
    <div className="flex items-center gap-2">
      {marker && (
        <span
          aria-hidden="true"
          className={cn("size-3 shrink-0 rounded-full border", marker)}
        />
      )}
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", valueClassName)}>
        {value}
      </span>
    </div>
  );
}
