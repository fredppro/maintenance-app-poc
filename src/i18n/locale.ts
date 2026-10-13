import * as z from "zod";
import { APPLICATION_LOCALES, localeKeys } from "./config";
import { routing } from "./routing";

export const localeSchema = z.enum(localeKeys);
export type AppLocale = z.infer<typeof localeSchema>;

export const LOCALE_MAP = Object.fromEntries(
  Object.entries(APPLICATION_LOCALES).map(([key, value]) => [
    key,
    value.dateLocale,
  ]),
) as Record<AppLocale, typeof import("date-fns/locale").enUS>;

/**
 * Validates a raw string input against the application's supported locales.
 * @description Safely falls back to the configured defaultLocale if validation fails.
 */
export function getValidLocale(rawLocale: unknown): AppLocale {
  const parsed = localeSchema.safeParse(rawLocale);
  return parsed.success ? parsed.data : (routing.defaultLocale);
}
