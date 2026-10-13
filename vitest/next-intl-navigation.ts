import { createElement, type ReactNode } from "react";

export function createNavigation() {
  const noop = () => undefined;

  return {
    Link: ({
      children,
      href,
    }: {
      children?: ReactNode;
      href?: string;
    }) => createElement("a", { href }, children),
    redirect: () => {
      throw new Error("redirect() is not supported in Vitest");
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
}
