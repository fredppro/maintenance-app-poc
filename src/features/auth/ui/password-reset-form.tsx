"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
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

export function PasswordResetForm({
  locale,
  token,
}: {
  locale: string;
  token?: string;
}) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(event.currentTarget);

    try {
      const result = token
        ? await authClient.resetPassword({
            token,
            newPassword: String(formData.get("password")),
          })
        : await authClient.requestPasswordReset({
            email: String(formData.get("email")),
            redirectTo: `${window.location.origin}/${locale}/reset-password`,
          });

      if (result.error) {
        setError(t("error"));
        return;
      }
      setComplete(true);
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card variant="elevated" className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t(token ? "resetPasswordTitle" : "forgotPassword")}</CardTitle>
        <CardDescription>
          {t(complete ? "resetPasswordComplete" : "resetPasswordDescription")}
        </CardDescription>
      </CardHeader>
      {!complete && (
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {token ? (
                <Field>
                  <FieldLabel htmlFor="password">{t("newPassword")}</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </Field>
              )}
              {error && <FieldError>{error}</FieldError>}
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {t(token ? "resetPasswordSubmit" : "sendResetLink")}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      )}
      {complete && (
        <CardContent>
          <Link className="text-primary underline underline-offset-4" href="/login">
            {t("signInLink")}
          </Link>
        </CardContent>
      )}
    </Card>
  );
}
