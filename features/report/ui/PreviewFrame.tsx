"use client";

import { getValidLocale } from "@/i18n/locale";
import { useLocale } from "next-intl";
import { useCallback, useState } from "react";
import { useReportPreviewRefresh } from "../hooks/useReportPreviewRefresh";

export function PreviewFrame({ taskId }: { taskId: string }) {
  const locale = getValidLocale(useLocale());
  
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useReportPreviewRefresh(taskId, refresh);

  return (
    <iframe
      key={version}
      src={`/api/tasks/${taskId}/report?mode=preview&locale=${locale}&v=${version}`}
      className="h-[100vh] w-full rounded border"
    />
  );
}
