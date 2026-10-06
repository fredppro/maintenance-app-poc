// @/i18n/routing.ts
import React from "react";
import { localeKeys } from "./config";

const noop = () => undefined;
const fallbackLink = ({ children, href, ...props }: any) =>
  React.createElement("a", { href: typeof href === "string" ? href : "#", ...props }, children);

const fallbackNavigation = {
  Link: fallbackLink,
  redirect: () => {
    throw new Error("redirect() is unavailable in the current test/runtime environment.");
  },
  usePathname: () => "/",
  useRouter: () => ({
    push: noop,
    replace: noop,
    refresh: noop,
    back: noop,
    forward: noop,
    prefetch: noop,
  }),
  getPathname: () => "/",
};

let routing = {
  locales: localeKeys,
  defaultLocale: localeKeys[0],
};

let navigation = fallbackNavigation;

try {
  const { defineRouting } = await import("next-intl/routing");
  const { createNavigation } = await import("next-intl/navigation");

  routing = defineRouting({
    locales: localeKeys,
    defaultLocale: localeKeys[0],
  });

  navigation = createNavigation(routing);
} catch {
  // Vitest and some non-Next runtime checks use this path without a full Next app runtime.
}

export { routing };
export const { Link, redirect, usePathname, useRouter, getPathname } = navigation;