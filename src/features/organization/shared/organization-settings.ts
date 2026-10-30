import { z } from "zod";
import { localeKeys } from "@/i18n/config";

export const DEFAULT_ORGANIZATION_TIMEZONE = "Europe/Lisbon";
export const DEFAULT_ORGANIZATION_LOCALE = localeKeys[0];

/** IANA time zone ids; `Intl.supportedValuesOf` leaves out plain "UTC". */
export function supportedTimeZones(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

const NO_CONTROL_CHARACTERS = /^[^\p{Cc}\p{Cf}]*$/u;
const PHONE_CHARACTERS = /^\+?[0-9 ()\-.]+$/;

// Error messages are stable codes; the form maps them to translated text.
const optionalText = (schema: z.ZodType<string, string>) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .pipe(schema.nullable());

/** First error code per field, in the order the schema reports them. */
export function firstErrorPerField(error: z.ZodError) {
  const errors: Partial<Record<string, SettingsErrorCode>> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    errors[field] ??= issue.message as SettingsErrorCode;
  }
  return errors as Partial<Record<OrganizationSettingsField, SettingsErrorCode>>;
}

export const organizationSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "tooShort")
    .max(100, "tooLong")
    .regex(NO_CONTROL_CHARACTERS, "invalid"),
  contactEmail: optionalText(
    z.string().max(254, "tooLong").email("invalid"),
  ).transform((value) => value?.toLowerCase() ?? null),
  contactPhone: optionalText(
    z
      .string()
      .max(30, "tooLong")
      .regex(PHONE_CHARACTERS, "invalid")
      .refine((value) => {
        const digits = value.replace(/\D/g, "").length;
        return digits >= 5 && digits <= 15;
      }, "invalid"),
  ),
  timezone: z.string().refine((value) => supportedTimeZones().includes(value), "invalid"),
  locale: z.enum(localeKeys, { message: "invalid" }),
  logoFileId: z.string().min(1, "invalid").max(64, "invalid").nullable(),
});

export type OrganizationSettingsInput = z.input<typeof organizationSettingsSchema>;
export type OrganizationSettingsData = z.output<typeof organizationSettingsSchema>;
export type OrganizationSettingsField = keyof OrganizationSettingsData;
export type SettingsErrorCode = "tooShort" | "tooLong" | "invalid";

/** What the settings page shows: saved values, with the defaults filled in where nothing was saved. */
export type OrganizationSettingsView = {
  name: string;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  locale: (typeof localeKeys)[number];
  logoFileId: string | null;
};

export type UpdateOrganizationSettingsResult =
  | { ok: true }
  | { ok: false; errors: Partial<Record<OrganizationSettingsField, SettingsErrorCode>> };

/** A stored locale, or the default when none is saved or it is no longer supported. */
export function resolveOrganizationLocale(value: string | null | undefined) {
  return localeKeys.find((key) => key === value) ?? DEFAULT_ORGANIZATION_LOCALE;
}

export function toSettingsView(
  organization: { name: string },
  settings: {
    contactEmail: string | null;
    contactPhone: string | null;
    timezone: string | null;
    locale: string | null;
    logoFileId: string | null;
  } | null,
): OrganizationSettingsView {
  const locale = resolveOrganizationLocale(settings?.locale);
  return {
    name: organization.name,
    contactEmail: settings?.contactEmail ?? "",
    contactPhone: settings?.contactPhone ?? "",
    timezone: settings?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE,
    locale,
    logoFileId: settings?.logoFileId ?? null,
  };
}
