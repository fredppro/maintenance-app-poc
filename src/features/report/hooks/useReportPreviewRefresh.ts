"use client";

import { useEffect } from "react";
import { subscribeToTaskUpdates } from "@/features/scheduler/events";

export function useReportPreviewRefresh(
  taskId: string,
  onRefresh: () => void,
) {
  useEffect(() => {
    return subscribeToTaskUpdates((changedTaskId) => {
      if (changedTaskId === taskId) {
        onRefresh();
      }
    });
  }, [taskId, onRefresh]);
}