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
          <Progress value={(i.value / max) * 100} />
        </li>
      ))}
    </ul>
  );
}

export function MetricsPageClient() {
  const t = useTranslations("MetricsPage");
  const entries = useSchedulerStore((s) => s.entries);
  const equipment = useSchedulerStore((s) => s.equipment);

  const m = useMemo(() => {
    const now = Date.now();
    const completed = entries.filter((e) => e.status === "completed").length;
    const open = entries.filter((e) => e.status !== "completed");
    const count = (f: (e: (typeof entries)[number]) => boolean) =>
      entries.filter(f).length;
    const perEquipment = equipment
      .map((eq) => ({
        label: eq.name,
        value: entries.filter((e) => e.equipmentId === eq.id).length,
      }))
      .filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    return {
      total: entries.length,
      completion: entries.length
        ? Math.round((completed / entries.length) * 100)
        : 0,
      overdue: open.filter((e) => +new Date(e.endTime) < now).length,
      upcoming: open.filter((e) => +new Date(e.endTime) >= now).length,
      types: [
        { label: t("preventive"), value: count((e) => e.type === "PREVENTIVE") },
        { label: t("corrective"), value: count((e) => e.type === "CORRECTIVE") },
        { label: t("inspection"), value: count((e) => e.type === "INSPECTION") },
      ],
      statuses: [
        { label: t("scheduled"), value: count((e) => e.status === "scheduled") },
        {
          label: t("inProgress"),
          value: count((e) => e.status === "in-progress"),
        },
        { label: t("completed"), value: completed },
      ],
      perEquipment,
    };
  }, [entries, equipment, t]);

  const kpis = [
    { label: t("total"), value: m.total },
    { label: t("completion"), value: `${m.completion}%` },
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
                <Bars items={m.types} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("byStatus")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Bars items={m.statuses} />
              </CardContent>
            </Card>
            {m.perEquipment.length > 0 && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>{t("topEquipment")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Bars items={m.perEquipment} />
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </PageBody>
  );
}
