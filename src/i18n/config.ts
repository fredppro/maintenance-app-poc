import { enUS, pt } from "date-fns/locale";

export const APPLICATION_LOCALES = {
  en: {
    label: "English",
    dateLocale: enUS,
    timeZone: "Europe/Lisbon", // 🔒 Locked together
    timeFormat: "hh:mm a", // 🕒 Outputs: "02:00 PM"
    dateFormat: "PPP hh:mm a", // 📅 Outputs: "May 12th, 2026 02:00 PM"
  },
  "pt-pt": {
    label: "Português (PT)",
    dateLocale: pt,
    timeZone: "Europe/Lisbon", // 🔒 Locked together
    timeFormat: "HH:mm", // 🕒 Outputs: "14:00"
    dateFormat: "PPP HH:mm", // 📅 Outputs: "12 de maio de 2026 14:00"
  },
} as const;

export const localeKeys = Object.keys(APPLICATION_LOCALES) as [
  keyof typeof APPLICATION_LOCALES,
  ...(keyof typeof APPLICATION_LOCALES)[],
];
