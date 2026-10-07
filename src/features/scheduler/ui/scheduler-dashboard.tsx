"use client";

import LanguageSwitcher from "@/components/language-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useSchedulerStore } from "../store/scheduler-provider";
import { Moon, Sun, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { TaskType } from "../../../../prisma/generated/prisma/enums";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SchedulerToolbar } from "./scheduler-toolbar";
import { TimelineGrid } from "./timeline-grid";

interface SchedulerDashboardProps {
  onOpenWorkers: () => void;
  onOpenMembers?: () => void;
  onSignOut: () => void;
  workersContent?: ReactNode;
  tenantContextControl?: ReactNode;
}

export function SchedulerDashboard({
  onOpenWorkers,
  onOpenMembers,
  onSignOut,
  workersContent,
  tenantContextControl,
}: SchedulerDashboardProps) {
  const entries = useSchedulerStore((state) => state.entries);
  const equipment = useSchedulerStore((state) => state.equipment);
  const t = useTranslations("Dashboard");

  const stats = {
    total: entries.length,
    scheduled: entries.filter((e) => e.status === "scheduled").length,
    inProgress: entries.filter((e) => e.status === "in-progress").length,
    completed: entries.filter((e) => e.status === "completed").length,
    preventive: entries.filter((e) => e.type === TaskType.PREVENTIVE).length,
    corrective: entries.filter((e) => e.type === TaskType.CORRECTIVE).length,
    inspection: entries.filter((e) => e.type === TaskType.INSPECTION).length,
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                {t("title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("description")}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap items-center justify-between gap-3 lg:flex-nowrap lg:gap-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-info/20 border border-info/40" />
                <span className="text-muted-foreground">
                  {t("stats.preventive")}
                </span>
                <span className="font-medium text-foreground">
                  {stats.preventive}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-destructive/20 border border-destructive/40" />
                <span className="text-muted-foreground">
                  {t("stats.corrective")}
                </span>
                <span className="font-medium text-foreground">
                  {stats.corrective}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-warning/20 border border-warning/40" />
                <span className="text-muted-foreground">
                  {t("stats.inspection")}
                </span>
                <span className="font-medium text-foreground">
                  {stats.inspection}
                </span>
              </div>
            </div>

            <div className="h-8 w-px bg-border" />

            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">
                  {t("stats.equipment")}:{" "}
                </span>
                <span className="font-medium text-foreground">
                  {equipment.length}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("stats.scheduled")}:{" "}
                </span>
                <span className="font-medium text-foreground">
                  {stats.scheduled}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t("stats.inProgress")}:{" "}
                </span>
                <span className="font-medium text-chart-3">
                  {stats.inProgress}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {tenantContextControl}
              <LanguageSwitcher />
              <ThemeToggle />
              <WorkerMenu
                onOpenWorkers={onOpenWorkers}
                onOpenMembers={onOpenMembers}
                onSignOut={onSignOut}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
        {/* Toolbar */}
        {workersContent ? null : <SchedulerToolbar />}

        {/* Content Area */}
        <div className="flex-1 flex gap-4 overflow-hidden">
          {workersContent ?? <TimelineGrid />}
        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-border bg-card px-3 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t("footer.clickHint")}</span>
            <span>•</span>
            <span>{t("footer.dragHint")}</span>
            <span>•</span>
            <span>{t("footer.zoomHint")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1">
              <div className="size-2 rounded-full bg-info" />
              <span>{t("stats.preventive")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="size-2 rounded-full bg-destructive" />
              <span>{t("stats.corrective")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="size-2 rounded-full bg-warning" />
              <span>{t("stats.inspection")}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("Dashboard");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t("toggleTheme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" aria-hidden="true" />
      <Moon className="block dark:hidden" aria-hidden="true" />
    </Button>
  );
}

function WorkerMenu({
  onOpenWorkers,
  onOpenMembers,
  onSignOut,
}: {
  onOpenWorkers: () => void;
  onOpenMembers?: () => void;
  onSignOut: () => void;
}) {
  const t = useTranslations("Dashboard");
  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full hover:bg-accent/20 p-1">
            <Avatar className="size-8">
              <AvatarFallback>ME</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              /* open account */
            }}
          >
            {t("menu.account")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenWorkers}>
            {t("menu.workers")}
          </DropdownMenuItem>
          {onOpenMembers && (
            <DropdownMenuItem onClick={onOpenMembers}>
              {t("menu.members")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut} variant="destructive">
            {t("menu.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
