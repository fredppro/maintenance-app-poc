"use client";

import { getValidLocale } from "src/i18n/locale";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/routing";
import { useReportPreviewRefresh } from "../hooks/useReportPreviewRefresh";

export function PreviewFrame({ taskId }: { taskId: string }) {
  const locale = getValidLocale(useLocale());
  const t = useTranslations("PDF");
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useReportPreviewRefresh(taskId, refresh);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-page sm:px-page-desktop">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button asChild size="sm" variant="ghost">
            <Link href="/">
              <ArrowLeft data-icon="inline-start" />
              <span className="sr-only sm:not-sr-only">{t("backToSchedule")}</span>
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{t("title")}</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {t("previewDescription")}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/tasks/${encodeURIComponent(taskId)}/report?mode=download&locale=${locale}`}
          >
            <Download data-icon="inline-start" />
            {t("downloadReport")}
          </a>
        </Button>
      </header>
      <main className="min-h-0 flex-1 p-page sm:p-page-desktop">
        <iframe
          key={version}
          title={t("title")}
          src={`/api/tasks/${encodeURIComponent(taskId)}/report?mode=preview&locale=${locale}&v=${version}`}
          className="size-full rounded-lg border border-border bg-card"
        />
      </main>
    </div>
  );
}
