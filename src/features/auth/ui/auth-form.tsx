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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/auth/client";
import { Boxes, CalendarDays, Eye, EyeOff, Wrench } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/i18n/locale";

export function AuthForm({
  mode,
  locale,
  invitationId,
  emailVerificationEnabled = false,
}: {
  mode: "sign-in" | "sign-up";
  locale: AppLocale;
  invitationId?: string;
  emailVerificationEnabled?: boolean;
}) {
  const t = useTranslations("Auth");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordHintId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    const callbackURL = invitationId
      ? `/${locale}/accept-invitation?id=${encodeURIComponent(invitationId)}`
      : `/${locale}/onboarding`;

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

      if (mode === "sign-up" && emailVerificationEnabled) {
        setVerificationNotice(true);
        return;
      }

      window.location.assign(callbackURL);
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }

  const isSignUp = mode === "sign-up";

  return isSignUp ? (
    <>
      <section className="mx-auto w-full max-w-lg">
        <Link
          href="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wrench aria-hidden="true" className="size-5" />
          </span>
          {t("productName")}
        </Link>
        <Card variant="elevated" className="w-full">
          <CardHeader className="gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
              {t("signUpEyebrow")}
            </p>
            <CardTitle className="text-2xl tracking-tight sm:text-3xl">
              {t("signUpTitle")}
            </CardTitle>
            <CardDescription className="text-base">
              {t("signUpDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} aria-busy={pending}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    onInvalid={(event) => {
                      const input = event.currentTarget;
                      input.setCustomValidity(
                        input.validity.valueMissing
                          ? t("nameRequired")
                          : input.validity.tooShort
                            ? t("nameTooShort")
                            : "",
                      );
                    }}
                    onInput={(event) =>
                      event.currentTarget.setCustomValidity("")
                    }
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    onInvalid={(event) => {
                      const input = event.currentTarget;
                      input.setCustomValidity(
                        input.validity.valueMissing
                          ? t("emailRequired")
                          : input.validity.typeMismatch
                            ? t("emailInvalid")
                            : "",
                      );
                    }}
                    onInput={(event) =>
                      event.currentTarget.setCustomValidity("")
                    }
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="password"
                      name="password"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={8}
                      aria-describedby={passwordHintId}
                      onInvalid={(event) => {
                        const input = event.currentTarget;
                        input.setCustomValidity(
                          input.validity.valueMissing
                            ? t("passwordRequired")
                            : input.validity.tooShort
                              ? t("passwordTooShort")
                              : "",
                        );
                      }}
                      onInput={(event) =>
                        event.currentTarget.setCustomValidity("")
                      }
                      required
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t(
                          passwordVisible ? "hidePassword" : "showPassword",
                        )}
                        aria-pressed={passwordVisible}
                        onClick={() => setPasswordVisible((visible) => !visible)}
                      >
                        {passwordVisible ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription id={passwordHintId}>
                    {t("passwordRequirement")}
                  </FieldDescription>
                </Field>
                {error && (
                  <FieldError role="alert" aria-live="polite">
                    {error}
                  </FieldError>
                )}
                {verificationNotice && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-sm text-muted-foreground"
                  >
                    {t("verificationNotice")}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={pending || verificationNotice}
                  aria-busy={pending}
                >
                  {pending && (
                    <Spinner
                      data-icon="inline-start"
                      aria-label={t("signingUp")}
                    />
                  )}
                  {pending ? t("signingUp") : t("signUp")}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  {t("signInPrompt")}{" "}
                  <Link
                    className="font-medium text-primary underline underline-offset-4"
                    href={
                      invitationId
                        ? `/login?invitationId=${encodeURIComponent(invitationId)}`
                        : "/login"
                    }
                  >
                    {t("signInLink")}
                  </Link>
                </p>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </section>
      <SignupProductPreview />
    </>
  ) : (
    <Card variant="elevated" className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("signInTitle")}</CardTitle>
        <CardDescription>{t("signInDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} aria-busy={pending}>
          <FieldGroup>
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
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                required
              />
            </Field>
            {error && (
              <FieldError role="alert" aria-live="polite">
                {error}
              </FieldError>
            )}
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending && (
                <Spinner
                  data-icon="inline-start"
                  aria-label={t("signingIn")}
                />
              )}
              {pending ? t("signingIn") : t("signIn")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t("createAccountPrompt")}{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href={
                  invitationId
                    ? `/signup?invitationId=${encodeURIComponent(invitationId)}`
                    : "/signup"
                }
              >
                {t("createAccountLink")}
              </Link>
            </p>
            <p className="text-center text-sm">
              <Link
                className="text-primary underline underline-offset-4"
                href="/reset-password"
              >
                {t("forgotPassword")}
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function SignupProductPreview() {
  const t = useTranslations("Auth");

  return (
    <aside className="relative hidden min-h-[38rem] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-surface-muted p-8 lg:flex xl:p-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:32px_32px]"
      />
      <div className="relative flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Wrench aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="font-semibold text-foreground">{t("productName")}</p>
          <p className="text-xs text-muted-foreground">{t("previewEyebrow")}</p>
        </div>
      </div>

      <Card className="relative mx-auto w-full max-w-md gap-0 overflow-hidden rounded-xl py-0">
        <CardHeader className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm">{t("previewTitle")}</CardTitle>
              <CardDescription className="mt-1">
                {t("previewDescription")}
              </CardDescription>
            </div>
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary-muted text-primary">
              <CalendarDays aria-hidden="true" className="size-5" />
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Boxes aria-hidden="true" className="size-4" />
                {t("previewEquipment")}
              </div>
              <p className="mt-2 text-xl font-semibold text-foreground">12</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="text-xs text-muted-foreground">
                {t("previewScheduled")}
              </p>
              <p className="mt-2 text-xl font-semibold text-foreground">08</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[5rem_repeat(5,minmax(0,1fr))] border-b border-border bg-muted/60 text-center text-[10px] font-medium text-muted-foreground">
              <span className="border-r border-border p-2">
                {t("previewWeek")}
              </span>
              {([
                "previewMonday",
                "previewTuesday",
                "previewWednesday",
                "previewThursday",
                "previewFriday",
              ] as const).map((day) => (
                <span
                  key={day}
                  className="border-r border-border-subtle p-2 last:border-r-0"
                >
                  {t(day)}
                </span>
              ))}
            </div>
            {[
              { label: t("previewAssetOne"), start: "col-start-1", span: "col-span-2", tone: "bg-info/10 text-info border-info/20" },
              { label: t("previewAssetTwo"), start: "col-start-3", span: "col-span-2", tone: "bg-warning/10 text-warning border-warning/20" },
              { label: t("previewAssetThree"), start: "col-start-2", span: "col-span-3", tone: "bg-primary-muted text-primary border-primary/20" },
            ].map((task) => (
              <div
                key={task.label}
                className="grid grid-cols-[5rem_repeat(5,minmax(0,1fr))] border-b border-border-subtle last:border-b-0"
              >
                <span className="truncate border-r border-border bg-card px-2 py-3 text-[10px] text-muted-foreground">
                  {task.label}
                </span>
                <div className="col-span-5 grid grid-cols-5 gap-1 p-1.5">
                  <span
                    className={cn(
                      task.start,
                      task.span,
                      "truncate rounded-md border px-2 py-1.5 text-[10px] font-medium",
                      task.tone,
                    )}
                  >
                    {task.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <p className="relative max-w-sm text-sm leading-relaxed text-muted-foreground">
        {t("previewFooter")}
      </p>
    </aside>
  );
}
