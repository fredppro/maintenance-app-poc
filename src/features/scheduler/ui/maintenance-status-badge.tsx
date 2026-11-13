"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";
import { isTaskStatus } from "../task-status";
import { getTaskStatusPresentation } from "./task-status-presentation";

export function MaintenanceStatusBadge({ status }: { status: string }) {
  const t = useTranslations("Form");
  return (
    <Badge variant={getTaskStatusPresentation(status).tone}>
      {isTaskStatus(status) ? t(`statusTypes.${status}`) : status}
    </Badge>
  );
}
