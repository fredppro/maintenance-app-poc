"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
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

export function AuthForm({
  mode,
  locale,
}: {
  mode: "sign-in" | "sign-up";
  locale: string;
}) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    const callbackURL = `/${locale}/onboarding`;

    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              name: String(formData.get("name")),
              email,
              password,
              callbackURL,
            })
          : await authClient.signIn.email({
              email,
              password,
              callbackURL,
            });

      if (result.error) {
        setError(t("error"));
        return;
      }

      router.replace("/onboarding");
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }

  const isSignUp = mode === "sign-up";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t(isSignUp ? "signUpTitle" : "signInTitle")}</CardTitle>
        <CardDescription>
          {t(isSignUp ? "signUpDescription" : "signInDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {isSignUp && (
              <Field>
                <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
                <Input id="name" name="name" autoComplete="name" required />
              </Field>
            )}
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
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={8}
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {t(isSignUp ? "signUp" : "signIn")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t(isSignUp ? "signInPrompt" : "createAccountPrompt")}{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href={isSignUp ? "/login" : "/signup"}
              >
                {t(isSignUp ? "signInLink" : "createAccountLink")}
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
