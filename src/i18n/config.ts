import { enUS, pt } from "date-fns/locale";

export const APPLICATION_LOCALES = {
  en: {
    label: "English",
    dateLocale: enUS,
    timeZone: "Europe/Lisbon", // 🔒 Locked together
    timeFormat: "hh:mm a", // 🕒 Outputs: "02:00 PM"
    dateFormat: "dd/MM/yyyy HH:mm", // 07/10/2026 14:00
  },
  "pt-pt": {
    label: "Português (PT)",
    dateLocale: pt,
    timeZone: "Europe/Lisbon", // 🔒 Locked together
    timeFormat: "HH:mm", // 🕒 Outputs: "14:00"
    dateFormat: "dd/MM/yyyy HH:mm", // 07/10/2026 14:00
  },
} as const;

export const localeKeys = Object.keys(APPLICATION_LOCALES) as [
  keyof typeof APPLICATION_LOCALES,
  ...(keyof typeof APPLICATION_LOCALES)[],
];
