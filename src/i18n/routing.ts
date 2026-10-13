// @/i18n/routing.ts
import { localeKeys } from "./config";
import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: localeKeys,
  defaultLocale: localeKeys[0],
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);