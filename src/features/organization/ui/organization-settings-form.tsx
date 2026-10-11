"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { uploadImage } from "@/features/files/client/image";
import { updateOrganizationSettings } from "@/features/organization/server/settings";
import {
  firstErrorPerField,
  organizationSettingsSchema,
  supportedTimeZones,
  type OrganizationSettingsField,
  type OrganizationSettingsView,
  type SettingsErrorCode,
} from "@/features/organization/shared/organization-settings";
import { APPLICATION_LOCALES, localeKeys } from "@/i18n/config";
import { useRouter } from "@/i18n/routing";
import {
  OrganizationLogoField,
  type OrganizationLogoValue,
} from "./organization-logo-field";

type Values = Omit<OrganizationSettingsView, "logoFileId">;
type Errors = Partial<Record<OrganizationSettingsField, SettingsErrorCode>>;

const FIELD_IDS = {
  name: "organization-name",
  contactEmail: "organization-contact-email",
  contactPhone: "organization-contact-phone",
  timezone: "organization-timezone",
  locale: "organization-locale",
  logoFileId: "organization-logo",
} as const;

const toValues = (view: OrganizationSettingsView): Values => ({
  name: view.name,
  contactEmail: view.contactEmail,
  contactPhone: view.contactPhone,
  timezone: view.timezone,
  locale: view.locale,
});

/** Company profile and regional preferences of the active organization. */
export function OrganizationSettingsForm({ initial }: { initial: OrganizationSettingsView }) {
  const t = useTranslations("OrganizationSettings");
  const router = useRouter();
  const timezones = useMemo(
    () => supportedTimeZones().map((zone) => ({ value: zone, label: zone })),
    [],
  );

  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState<Values>(toValues(initial));
  const [logo, setLogo] = useState<OrganizationLogoValue>({ fileId: initial.logoFileId, pending: null });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const dirty =
    logo.pending !== null ||
    logo.fileId !== saved.logoFileId ||
    (Object.keys(values) as (keyof Values)[]).some((key) => values[key] !== saved[key]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const message = (field: OrganizationSettingsField) => {
    const code = errors[field];
    if (!code) return null;
    // Not every field has every code; fall back to the generic "invalid" text.
    return t.has(`errors.${field}.${code}`) ? t(`errors.${field}.${code}` as "errors.name.tooShort") : t(`errors.${field}.invalid` as "errors.name.invalid");
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;
    setFormError(null);

    const check = organizationSettingsSchema.safeParse({ ...values, logoFileId: logo.fileId });
    if (!check.success) {
      const found = firstErrorPerField(check.error);
      setErrors(found);
      const first = (Object.keys(found) as OrganizationSettingsField[])[0];
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }

    setPending(true);
    try {
      let logoFileId = logo.fileId;
      if (logo.pending) {
        try {
          logoFileId = await uploadImage(logo.pending, logo.pending.type === "image/jpeg" ? "logo.jpg" : "logo.png");
        } catch {
          setFormError(t("logoUploadFailed"));
          return;
        }
        // Keep the uploaded file so a retry after a validation error does not upload it again.
        setLogo({ fileId: logoFileId, pending: null });
      }

      const result = await updateOrganizationSettings({ ...values, logoFileId });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }

      const next: OrganizationSettingsView = {
        name: check.data.name,
        contactEmail: check.data.contactEmail ?? "",
        contactPhone: check.data.contactPhone ?? "",
        timezone: check.data.timezone,
        locale: check.data.locale,
        logoFileId,
      };
      setSaved(next);
      setValues(toValues(next));
      setErrors({});
      toast.success(t("saved"));
      router.refresh();
    } catch {
      setFormError(t("saveError"));
    } finally {
      setPending(false);
    }
  }

  const invalid = (field: OrganizationSettingsField) => Boolean(errors[field]);

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6" aria-label={t("title")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("profileTitle")}</CardTitle>
          <CardDescription>{t("profileDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={invalid("logoFileId") || undefined}>
              <FieldLabel htmlFor={FIELD_IDS.logoFileId}>{t("logo")}</FieldLabel>
              <OrganizationLogoField
                id={FIELD_IDS.logoFileId}
                name={values.name}
                value={logo}
                onChange={(next) => {
                  setLogo(next);
                  setErrors((current) => ({ ...current, logoFileId: undefined }));
                }}
                disabled={pending}
              />
              <FieldDescription>{t("logoHint")}</FieldDescription>
              {message("logoFileId") && <FieldError>{message("logoFileId")}</FieldError>}
            </Field>
            <Field data-invalid={invalid("name") || undefined}>
              <FieldLabel htmlFor={FIELD_IDS.name}>{t("name")}</FieldLabel>
              <Input
                id={FIELD_IDS.name}
                value={values.name}
                autoComplete="organization"
                maxLength={100}
                aria-invalid={invalid("name")}
                disabled={pending}
                onChange={(event) => set("name", event.target.value)}
              />
              {message("name") && <FieldError>{message("name")}</FieldError>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("contactEmail") || undefined}>
                <FieldLabel htmlFor={FIELD_IDS.contactEmail}>{t("contactEmail")}</FieldLabel>
                <Input
                  id={FIELD_IDS.contactEmail}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={values.contactEmail}
                  aria-invalid={invalid("contactEmail")}
                  disabled={pending}
                  onChange={(event) => set("contactEmail", event.target.value)}
                />
                <FieldDescription>{t("contactEmailHint")}</FieldDescription>
                {message("contactEmail") && <FieldError>{message("contactEmail")}</FieldError>}
              </Field>
              <Field data-invalid={invalid("contactPhone") || undefined}>
                <FieldLabel htmlFor={FIELD_IDS.contactPhone}>{t("contactPhone")}</FieldLabel>
                <Input
                  id={FIELD_IDS.contactPhone}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={values.contactPhone}
                  aria-invalid={invalid("contactPhone")}
                  disabled={pending}
                  onChange={(event) => set("contactPhone", event.target.value)}
                />
                <FieldDescription>{t("contactPhoneHint")}</FieldDescription>
                {message("contactPhone") && <FieldError>{message("contactPhone")}</FieldError>}
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("regionalTitle")}</CardTitle>
          <CardDescription>{t("regionalDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={invalid("timezone") || undefined}>
              <FieldLabel htmlFor={FIELD_IDS.timezone}>{t("timezone")}</FieldLabel>
              <SearchableSelect
                id={FIELD_IDS.timezone}
                aria-label={t("timezone")}
                options={timezones}
                value={values.timezone}
                onChange={(zone) => set("timezone", zone)}
                placeholder={t("timezonePlaceholder")}
                searchPlaceholder={t("timezoneSearch")}
                emptyText={t("timezoneEmpty")}
              />
              <FieldDescription>{t("timezoneHint")}</FieldDescription>
              {message("timezone") && <FieldError>{message("timezone")}</FieldError>}
            </Field>
            <Field data-invalid={invalid("locale") || undefined}>
              <FieldLabel htmlFor={FIELD_IDS.locale}>{t("locale")}</FieldLabel>
              <Select
                value={values.locale}
                disabled={pending}
                onValueChange={(locale) => set("locale", locale as Values["locale"])}
              >
                <SelectTrigger id={FIELD_IDS.locale} className="w-full" aria-invalid={invalid("locale")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {localeKeys.map((key) => (
                      <SelectItem key={key} value={key}>
                        {APPLICATION_LOCALES[key].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{t("localeHint")}</FieldDescription>
              {message("locale") && <FieldError>{message("locale")}</FieldError>}
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !dirty} aria-busy={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {t("save")}
        </Button>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
