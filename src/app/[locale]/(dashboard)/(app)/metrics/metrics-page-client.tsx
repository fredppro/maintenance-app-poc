"use client";

import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { summarizeMetrics } from "@/features/scheduler/utils/insights";
import { useSchedulerStore } from "@/features/scheduler/store/scheduler-provider";

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => (
        <li key={i.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="tabular-nums text-muted-foreground">{i.value}</span>
          </div>
          <Progress aria-label={i.label} value={(i.value / max) * 100} />
        </li>
      ))}
    </ul>
  );
}

export function MetricsPageClient() {
  const t = useTranslations("MetricsPage");
  const entries = useSchedulerStore((s) => s.entries);
  const equipment = useSchedulerStore((s) => s.equipment);

  const m = useMemo(
    () => summarizeMetrics(entries, equipment, Date.now()),
    [entries, equipment],
  );
  const types = [
    { label: t("preventive"), value: m.byType.preventive },
    { label: t("corrective"), value: m.byType.corrective },
    { label: t("inspection"), value: m.byType.inspection },
  ];
  const statuses = [
    { label: t("scheduled"), value: m.byStatus.scheduled },
    { label: t("inProgress"), value: m.byStatus.inProgress },
    { label: t("completed"), value: m.byStatus.completed },
  ];

  const kpis = [
    { label: t("total"), value: m.total },
    { label: t("completion"), value: `${m.completionRate}%` },
    { label: t("upcoming"), value: m.upcoming },
    { label: t("overdue"), value: m.overdue },
  ];

  return (
    <PageBody>
      <PageHeader title={t("title")} description={t("description")} />
      {entries.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3 />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label}>
                <CardHeader>
                  <CardDescription>{k.label}</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">
                    {k.value}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("byType")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Bars items={types} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("byStatus")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Bars items={statuses} />
              </CardContent>
            </Card>
            {m.topEquipment.length > 0 && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>{t("topEquipment")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Bars items={m.topEquipment} />
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </PageBody>
  );
}
