"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Link } from "@/i18n/routing";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("Errors");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("errorTitle")}</EmptyTitle>
          <EmptyDescription>{t("errorDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button onClick={reset}>{t("retry")}</Button>
          <Button variant="outline" asChild>
            <Link href="/">{t("backToDashboard")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
