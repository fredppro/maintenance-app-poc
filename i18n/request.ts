import { getRequestConfig } from "next-intl/server";
import { APPLICATION_LOCALES } from "./config";
import { getValidLocale } from "./locale";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = getValidLocale(await requestLocale);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: APPLICATION_LOCALES[locale].timeZone,
  };
});
