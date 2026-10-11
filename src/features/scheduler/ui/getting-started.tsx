"use client";

import { useMemo, useState } from "react";
import {
  Box,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { dismissOnboarding } from "@/features/organization/server/onboarding";
import {
  buildOnboardingSteps,
  summarizeOnboarding,
  type OnboardingProgress,
  type OnboardingStepId,
} from "@/features/organization/shared/onboarding";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { useSchedulerStore } from "../store/scheduler-provider";
import { AddEntryDialog } from "./add-entry-dialog";
import { EquipmentDialog } from "./equipment-dialog";

const STEP_ICONS: Record<OnboardingStepId, LucideIcon> = {
  organization: Check,
  site: MapPin,
  equipment: Box,
  task: CalendarPlus,
  workers: Users,
  team: UserPlus,
};

/**
 * "Getting started" checklist for owners and admins. Completion comes from the organization's
 * data (`progress`), plus what this page has just created; each action opens the existing workflow.
 */
export function GettingStarted({ progress }: { progress: OnboardingProgress }) {
  const t = useTranslations("Onboarding");
  const equipment = useSchedulerStore((state) => state.equipment);
  const workers = useSchedulerStore((state) => state.workers);
  const entries = useSchedulerStore((state) => state.entries);

  const [hidden, setHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [taskCell, setTaskCell] = useState<{ date: Date; equipmentId: string } | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);

  const steps = buildOnboardingSteps(progress, {
    equipment: equipment.length,
    workers: workers.length,
    tasks: entries.length,
  });
  const summary = summarizeOnboarding(steps);
  const remaining = steps.filter((step) => !step.done);
  const done = steps.filter((step) => step.done);
  const categories = useMemo(
    () => [...new Set(equipment.map((item) => item.category).filter(Boolean) as string[])],
    [equipment],
  );

  async function dismiss() {
    setHidden(true);
    try {
      await dismissOnboarding();
    } catch {
      setHidden(false);
      toast.error(t("dismissError"));
    }
  }

  // A task needs equipment to schedule and a worker to assign.
  const canScheduleTask = equipment.length > 0 && workers.length > 0;

  function scheduleFirstTask() {
    if (!canScheduleTask) return;
    setTaskCell({ date: new Date(), equipmentId: equipment[0].id });
    setTaskOpen(true);
  }

  if (hidden) return null;

  function action(id: OnboardingStepId, primary: boolean) {
    const variant = primary ? "default" : "outline";
    switch (id) {
      case "site":
        return (
          <Button asChild size="sm" variant={variant}>
            <Link href="/sites">{t("steps.site.action")}</Link>
          </Button>
        );
      case "workers":
        return (
          <Button asChild size="sm" variant={variant}>
            <Link href="/workers">{t("steps.workers.action")}</Link>
          </Button>
        );
      case "team":
        return (
          <Button asChild size="sm" variant={variant}>
            <Link href="/members">{t("steps.team.action")}</Link>
          </Button>
        );
      case "equipment":
        return (
          <Button size="sm" variant={variant} onClick={() => setEquipmentOpen(true)}>
            {t("steps.equipment.action")}
          </Button>
        );
      case "task":
        return (
          <Button
            size="sm"
            variant={variant}
            disabled={!canScheduleTask}
            onClick={scheduleFirstTask}
          >
            {t("steps.task.action")}
          </Button>
        );
      default:
        return null;
    }
  }

  return (
    <>
      <Card role="region" aria-label={t("title")} className="shrink-0 gap-3 py-3">
        <CardHeader className="gap-0.5 px-4">
          <CardTitle className="text-base">
            {summary.complete ? t("completeTitle") : t("title")}
          </CardTitle>
          <CardDescription>
            {summary.complete
              ? t("completeDescription")
              : t("remaining", { count: summary.remaining })}
          </CardDescription>
          <CardAction className="flex items-center gap-1">
            {summary.complete ? (
              <Button variant="outline" size="sm" onClick={dismiss}>
                {t("dismiss")}
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? t("expand") : t("collapse")}
                  onClick={() => setCollapsed((value) => !value)}
                >
                  {collapsed ? <ChevronDown /> : <ChevronUp />}
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("hide")} onClick={dismiss}>
                  <X />
                </Button>
              </>
            )}
          </CardAction>
        </CardHeader>

        {!summary.complete && !collapsed && (
          <CardContent className="flex flex-col gap-3 px-4">
            <Progress
              value={summary.percent}
              className="h-1.5"
              aria-label={t("progress", { done: summary.done, total: summary.total })}
            />
            <ItemGroup className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {remaining.map((step, index) => {
                const Icon = STEP_ICONS[step.id];
                return (
                  <Item
                    key={step.id}
                    variant="outline"
                    size="sm"
                    // On small screens only the next step shows, so the card stays short.
                    className={cn(index > 0 && "hidden sm:flex")}
                  >
                    <ItemMedia variant="icon">
                      <Icon />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t(`steps.${step.id as "site"}.title`)}</ItemTitle>
                      <ItemDescription>
                        {step.id === "task" && !canScheduleTask
                          ? t("steps.task.needsPrerequisites")
                          : t(`steps.${step.id as "site"}.description`)}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="w-full">
                      {action(step.id, index === 0)}
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
            <ul className="hidden flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground sm:flex">
              {done.map((step) => (
                <li key={step.id} className="flex items-center gap-1.5">
                  <Check aria-hidden="true" className="size-4 text-success" />
                  {t(`steps.${step.id as "site"}.done`)}
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      <EquipmentDialog
        open={equipmentOpen}
        onOpenChange={setEquipmentOpen}
        equipment={null}
        categories={categories}
      />
      <AddEntryDialog open={taskOpen} onOpenChange={setTaskOpen} selectedCell={taskCell} />
    </>
  );
}
