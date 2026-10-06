"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/client";
import { createInitialSite } from "@/features/organization/server/actions";

export function OrganizationSetupForm({
  activeOrganizationId,
}: {
  activeOrganizationId?: string;
}) {
  const t = useTranslations("OrganizationSetup");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const organizationName = String(formData.get("organizationName")).trim();
    const siteName = String(formData.get("siteName")).trim();

    try {
      let organizationId = activeOrganizationId;
      if (activeOrganizationId) {
        const result = await authClient.organization.setActive({
          organizationId: activeOrganizationId,
        });
        if (result.error) throw new Error(result.error.message);
      } else {
        const slug = organizationName
          .normalize("NFKD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48);
        if (!slug) throw new Error("Organization name cannot form a URL slug");
        const result = await authClient.organization.create({
          name: organizationName,
          slug: `${slug}-${crypto.randomUUID().slice(0, 8)}`,
        });
        if (result.error) throw new Error(result.error.message);
        organizationId = result.data.id;

        const activeResult = await authClient.organization.setActive({
          organizationId,
        });
        if (activeResult.error) throw new Error(activeResult.error.message);
      }
      if (!organizationId) throw new Error("Organization setup did not complete");
      await createInitialSite({ siteName, organizationId });
      router.replace("/");
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card variant="elevated" className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organizationName">
                {t("organizationName")}
              </FieldLabel>
              <Input
                id="organizationName"
                name="organizationName"
                autoComplete="organization"
                minLength={2}
                maxLength={100}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="siteName">{t("siteName")}</FieldLabel>
              <Input
                id="siteName"
                name="siteName"
                minLength={2}
                maxLength={100}
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {t("submit")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
