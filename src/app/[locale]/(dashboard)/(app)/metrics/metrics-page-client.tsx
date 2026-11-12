"use client";

import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageBody, PageGrid, PageHeader } from "@/components/app-shell/page-header";
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
import { cn } from "@/lib/utils";
import { getTaskStatusPresentation } from "@/features/scheduler/ui/task-status-presentation";
import type { SemanticTone } from "@/components/ui/semantic-tones";

function Bars({ items }: { items: { label: string; value: number; tone?: SemanticTone }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => (
        <li key={i.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="tabular-nums text-muted-foreground">{i.value}</span>
          </div>
          <Progress aria-label={i.label} value={(i.value / max) * 100} tone={i.tone} />
        </li>
      ))}
    </ul>
  );
}

export function MetricsPageClient() {
  const t = useTranslations("MetricsPage");
  const entries = useSchedulerStore((s) => s.entries);
  const equipment = useSchedulerStore((s) => s.equipment);

  const [now] = useState(() => Date.now());
  const m = useMemo(
    () => summarizeMetrics(entries, equipment, now),
    [entries, equipment, now],
  );
  const types = [
    { label: t("preventive"), value: m.byType.preventive },
    { label: t("corrective"), value: m.byType.corrective },
    { label: t("predictive"), value: m.byType.predictive },
  ];
  const statuses = [
    { label: t("scheduled"), value: m.byStatus.scheduled, tone: getTaskStatusPresentation("scheduled").tone },
    { label: t("inProgress"), value: m.byStatus.inProgress, tone: getTaskStatusPresentation("in-progress").tone },
    { label: t("completed"), value: m.byStatus.completed, tone: getTaskStatusPresentation("completed").tone },
  ];
  const kpis: {
    label: string;
    value: string | number;
    valueClassName?: string;
  }[] = [
    { label: t("total"), value: m.total },
    { label: t("completion"), value: `${m.completionRate}%` },
    { label: t("upcoming"), value: m.upcoming },
    {
      label: t("overdue"),
      value: m.overdue,
      valueClassName: m.overdue > 0 ? "text-destructive" : undefined,
    },
  ];

  return (
    <PageBody>
      <PageHeader title={t("title")} description={t("description")} />
      {entries.length === 0 ? (
        <Empty variant="surface">
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
          <Card
            variant="technical"
            density="compact"
            role="region"
            aria-labelledby="metrics-summary-title"
          >
            <CardHeader>
              <CardTitle
                id="metrics-summary-title"
                role="heading"
                aria-level={2}
              >
                {t("summary")}
              </CardTitle>
              <CardDescription>{t("allActivity")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-section gap-y-form @xl/page:grid-cols-4">
                {kpis.map((k) => (
                  <div key={k.label} className="flex min-w-0 flex-col gap-1">
                    <dt className="text-xs font-medium text-muted-foreground">
                      {k.label}
                    </dt>
                    <dd
                      className={cn(
                        "text-3xl font-semibold tabular-nums tracking-tight",
                        k.valueClassName,
                      )}
                    >
                      {k.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <PageGrid>
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
              <Card className="@2xl/page:col-span-2 @6xl/page:col-span-1">
                <CardHeader>
                  <CardTitle>{t("topEquipment")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Bars items={m.topEquipment} />
                </CardContent>
              </Card>
            )}
          </PageGrid>
        </>
      )}
    </PageBody>
  );
}
