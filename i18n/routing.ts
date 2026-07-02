// @/i18n/routing.ts
import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { localeKeys } from './config';

export const routing = defineRouting({
  locales: localeKeys,
  defaultLocale: localeKeys[0] // Fallbacks to `en`
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);