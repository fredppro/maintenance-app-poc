"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/client";

export function AcceptInvitation({
  invitationId,
  organizationId,
  organizationName,
  locale,
}: {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  locale: string;
}) {
  const t = useTranslations("Invitation");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (result.error) throw new Error(result.error.message);

      const activeResult = await authClient.organization.setActive({
        organizationId,
      });
      if (activeResult.error) throw new Error(activeResult.error.message);

      window.location.assign(`/${locale}/onboarding`);
    } catch {
      setError(t("acceptError"));
      setPending(false);
    }
  }

  return (
    <Card variant="elevated" className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { organizationName })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <FieldError>{error}</FieldError>}
        <Button type="button" disabled={pending} onClick={() => void accept()}>
          {pending && <Spinner data-icon="inline-start" />}
          {t("accept")}
        </Button>
      </CardContent>
    </Card>
  );
}
