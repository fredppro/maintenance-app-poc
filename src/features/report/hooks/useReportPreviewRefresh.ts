"use client";

import { useEffect } from "react";
import { subscribeToReportPreviewRefresh } from "../events";

export function useReportPreviewRefresh(
  taskId: string,
  onRefresh: () => void,
) {
  useEffect(() => {
    return subscribeToReportPreviewRefresh((changedTaskId) => {
      if (changedTaskId === taskId) {
        onRefresh();
      }
    });
  }, [taskId, onRefresh]);
}