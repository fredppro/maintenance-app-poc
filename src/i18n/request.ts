import { getRequestConfig } from "next-intl/server";
import { APPLICATION_LOCALES } from "./config";
import { getValidLocale, type AppLocale } from "./locale";
import enMessages from "./messages/en.json";
import ptPtMessages from "./messages/pt-pt.json";

const messages: Record<AppLocale, typeof enMessages> = {
  en: enMessages,
  "pt-pt": ptPtMessages,
};

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = getValidLocale(await requestLocale);

  return {
    locale,
    messages: messages[locale],
    timeZone: APPLICATION_LOCALES[locale].timeZone,
  };
});
