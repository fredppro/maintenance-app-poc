"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { DownloadIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { requestTenantExport } from "@/features/export/server/actions";
import {
  cancelOrganizationDeletion,
  requestOrganizationDeletion,
} from "@/features/organization/server/lifecycle";

export type ExportRow = {
  id: string;
  status: "PENDING" | "RUNNING" | "READY" | "FAILED";
  createdAt: string;
  expiresAt: string | null;
  size: number | null;
};

function useAction() {
  const router = useRouter();
  const t = useTranslations("OrganizationData");
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        toast.error(t("failed"));
      }
    });
  return { pending, run };
}

export function OrganizationExportCard({ exports }: { exports: ExportRow[] }) {
  const t = useTranslations("OrganizationData");
  const format = useFormatter();
  const router = useRouter();
  const { pending, run } = useAction();
  const inProgress = exports.some((row) => row.status === "PENDING" || row.status === "RUNNING");

  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [inProgress, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exportTitle")}</CardTitle>
        <CardDescription>{t("exportDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {exports.length === 0 && <p className="text-sm text-muted-foreground">{t("exportEmpty")}</p>}
        {exports.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={row.status === "FAILED" ? "destructive" : "secondary"}>
                {t(`status.${row.status}`)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {format.dateTime(new Date(row.createdAt), { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
            {row.status === "READY" && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/exports/${row.id}`}>
                  <DownloadIcon data-icon="inline-start" />
                  {t("download")}
                </a>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button disabled={pending || inProgress} onClick={() => run(requestTenantExport)}>
          {(pending || inProgress) && <Spinner data-icon="inline-start" />}
          {t("requestExport")}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function OrganizationDangerCard({
  isOwner,
  scheduledFor,
}: {
  isOwner: boolean;
  scheduledFor: string | null;
}) {
  const t = useTranslations("OrganizationData");
  const format = useFormatter();
  const { pending, run } = useAction();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("deleteTitle")}</CardTitle>
        <CardDescription>{t("deleteDescription")}</CardDescription>
      </CardHeader>
      {scheduledFor && (
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>{t("pendingTitle")}</AlertTitle>
            <AlertDescription>
              {t("pendingDescription", {
                date: format.dateTime(new Date(scheduledFor), { dateStyle: "long" }),
              })}
            </AlertDescription>
          </Alert>
        </CardContent>
      )}
      <CardFooter>
        {!isOwner ? (
          <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>
        ) : scheduledFor ? (
          <Button variant="outline" disabled={pending} onClick={() => run(cancelOrganizationDeletion)}>
            {pending && <Spinner data-icon="inline-start" />}
            {t("cancelDeletion")}
          </Button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">{t("requestDeletion")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => run(requestOrganizationDeletion)}>
                  {t("confirmDeletion")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardFooter>
    </Card>
  );
}
